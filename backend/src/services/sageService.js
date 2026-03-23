/**
 * VeriSage Pro – SAGE Posting Service
 *
 * Adapted from the reference project's insertInvoice.js pattern:
 *   - Awaits the singleton sagePoolPromise
 *   - Opens an explicit SQL transaction
 *   - Inserts header record, captures AutoIndex
 *   - Inserts line item(s) referencing header
 *   - Commits on success, rolls back on any error
 *
 * For VeriSage Pro, a registrar top-up maps to:
 *   SAGE InvNum  → receipt/payment document header
 *   SAGE _btblInvoiceLines → line item for the top-up amount
 */

const { sagePoolPromise, sql } = require('../config/database');
const logger = require('../config/logger');

/**
 * Post a single registrar top-up transaction to SAGE 200 Evolution.
 *
 * @param {object} txn - Validated transaction from our DB
 * @param {object} mapping - Registrar mapping (sage_account_id, sage_account_name)
 * @returns {{ sageRef: string }} - The SAGE AutoIndex reference
 */
async function postTransactionToSage(txn, mapping) {
  const pool = await sagePoolPromise;

  if (!pool) {
    throw new Error('SAGE database connection is not available');
  }

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // ── 1. Insert into SAGE InvNum (document header) ──────────────────────
    // DocType 2 = Receipt; adapt to your SAGE setup if different
    const headerRequest = new sql.Request(transaction);
    headerRequest.input('DocType',       sql.Int,      2);
    headerRequest.input('AccountID',     sql.Int,      mapping.sage_account_id);
    headerRequest.input('Description',   sql.VarChar,  `Registrar Top-Up: ${txn.cocca_transaction_ref}`);
    headerRequest.input('InvDate',       sql.DateTime, new Date(txn.top_up_date));
    headerRequest.input('InvTotIncl',    sql.Decimal,  parseFloat(txn.amount));
    headerRequest.input('InvTotTax',     sql.Decimal,  parseFloat(txn.vat_amount));
    headerRequest.input('InvTotExcl',    sql.Decimal,  parseFloat(txn.amount_excl_vat));
    headerRequest.input('cAccountName',  sql.VarChar,  mapping.sage_account_name);
    headerRequest.input('DocVersion',    sql.Int,      1);
    headerRequest.input('DocState',      sql.Int,      4);
    headerRequest.input('DocFlag',       sql.Int,      0);
    headerRequest.input('OrigDocID',     sql.Int,      0);
    // Store reference in the Notes/Reference field for traceability
    headerRequest.input('ExtOrderNum',       sql.VarChar,  txn.cocca_transaction_ref);

    const headerResult = await headerRequest.query(`
      DECLARE @Inserted TABLE (AutoIndex INT);

      INSERT INTO InvNum (
        DocType, AccountID, Description, InvDate,
        InvTotIncl, InvTotTax, InvTotExcl, cAccountName,
        DocVersion, DocState, DocFlag, OrigDocID, ExtOrderNum
      )
      OUTPUT INSERTED.AutoIndex INTO @Inserted
      VALUES (
        @DocType, @AccountID, @Description, @InvDate,
        @InvTotIncl, @InvTotTax, @InvTotExcl, @cAccountName,
        @DocVersion, @DocState, @DocFlag, @OrigDocID, @ExtOrderNum
      );

      SELECT AutoIndex FROM @Inserted;
    `);

    const sageAutoIndex = headerResult.recordset[0].AutoIndex;

    // ── 2. Insert into SAGE _btblInvoiceLines (line item) ─────────────────
    const lineRequest = new sql.Request(transaction);
    lineRequest.input('iInvoiceID',      sql.Int,     sageAutoIndex);
    lineRequest.input('cDescription',    sql.VarChar, `Top-Up | ${txn.registrar_name} | ${txn.payment_method}`);
    lineRequest.input('fQuantity',       sql.Float,   1);
    lineRequest.input('fUnitPriceExcl',  sql.Float,   parseFloat(txn.amount_excl_vat));
    lineRequest.input('fTaxRate',        sql.Float,   txn.vat_amount > 0
      ? parseFloat(((txn.vat_amount / txn.amount_excl_vat) * 100).toFixed(2))
      : 0);
    lineRequest.input('fLineDiscount',   sql.Float,   0);
    // iStockCodeID and iWarehouseID: set these to your SAGE environment's
    // "Registrar Services" stock item and default warehouse IDs
    lineRequest.input('iStockCodeID',    sql.Int,     parseInt(process.env.SAGE_STOCK_CODE_ID  || '1'));
    lineRequest.input('iWarehouseID',    sql.Int,     parseInt(process.env.SAGE_WAREHOUSE_ID   || '1'));
    lineRequest.input('iTaxTypeID',      sql.Int,     parseInt(process.env.SAGE_TAX_TYPE_ID    || '1'));

    await lineRequest.query(`
      INSERT INTO _btblInvoiceLines (
        iInvoiceID, cDescription, fQuantity, fUnitPriceExcl,
        fTaxRate, iStockCodeID, iWarehouseID, iTaxTypeID, fLineDiscount
      )
      VALUES (
        @iInvoiceID, @cDescription, @fQuantity, @fUnitPriceExcl,
        @fTaxRate, @iStockCodeID, @iWarehouseID, @iTaxTypeID, @fLineDiscount
      )
    `);

    await transaction.commit();

    logger.info('[SageService] Transaction posted to SAGE', {
      coccaRef:   txn.cocca_transaction_ref,
      sageAutoIndex,
      registrar:  txn.registrar_name,
      amount:     txn.amount,
    });

    return { sageRef: String(sageAutoIndex) };

  } catch (err) {
    await transaction.rollback();
    logger.error('[SageService] SAGE posting failed – transaction rolled back', {
      coccaRef: txn.cocca_transaction_ref,
      error:    err.message,
    });
    throw err;
  }
}

module.exports = { postTransactionToSage };
