/**
 * VeriSage Pro – Transaction Service
 *
 * Orchestrates the full pipeline:
 *   CoCCA payload → save to our DB → look up registrar mapping
 *   → post to SAGE → update sync status → create revenue schedule
 */

const { appPoolPromise, sql } = require('../config/database');
const { postTransactionToSage } = require('./sageService');
const { generateRevenueSchedule } = require('./incomeService');
const auditService = require('./auditService');
const logger = require('../config/logger');

/**
 * Receive and persist a CoCCA top-up transaction.
 * Returns the saved transaction record.
 */
async function receiveTransaction(payload) {
  const pool = await appPoolPromise;

  // Check idempotency – reject duplicate CoCCA refs
  const existing = await pool.request()
    .input('ref', sql.VarChar, payload.cocca_transaction_ref)
    .query(`SELECT id, sync_status FROM transactions WHERE cocca_transaction_ref = @ref`);

  if (existing.recordset.length > 0) {
    const dup = existing.recordset[0];
    logger.info('[TransactionService] Duplicate transaction received – ignored', {
      ref: payload.cocca_transaction_ref,
      existingStatus: dup.sync_status,
    });
    return { duplicate: true, existingId: dup.id };
  }

  const vatAmount    = parseFloat(payload.vat_amount    || 0);
  const amount       = parseFloat(payload.amount);
  const amountExcl   = parseFloat(payload.amount_excl_vat || (amount - vatAmount).toFixed(2));

  const result = await pool.request()
    .input('coccaRef',      sql.VarChar,   payload.cocca_transaction_ref)
    .input('registrarId',   sql.VarChar,   payload.registrar_id)
    .input('registrarName', sql.NVarChar,  payload.registrar_name)
    .input('amount',        sql.Decimal,   amount)
    .input('vatAmount',     sql.Decimal,   vatAmount)
    .input('amountExcl',    sql.Decimal,   amountExcl)
    .input('paymentMethod', sql.VarChar,   payload.payment_method)
    .input('topUpDate',     sql.DateTime,  new Date(payload.top_up_date))
    .input('packageName',   sql.NVarChar,  payload.package_name  || null)
    .input('domainName',    sql.NVarChar,  payload.domain_name   || null)
    .input('regYears',      sql.Int,       parseInt(payload.registration_years || 1))
    .input('rawPayload',    sql.NVarChar,  JSON.stringify(payload))
    .query(`
      INSERT INTO transactions (
        cocca_transaction_ref, registrar_id, registrar_name,
        amount, vat_amount, amount_excl_vat,
        payment_method, top_up_date, package_name, domain_name,
        registration_years, raw_payload, sync_status
      )
      OUTPUT INSERTED.*
      VALUES (
        @coccaRef, @registrarId, @registrarName,
        @amount, @vatAmount, @amountExcl,
        @paymentMethod, @topUpDate, @packageName, @domainName,
        @regYears, @rawPayload, 'pending'
      );
    `);

  const saved = result.recordset[0];

  await auditService.log({
    eventType:   auditService.EVENT_TYPES.TRANSACTION_RECEIVED,
    entityType:  'transaction',
    entityId:    saved.id,
    description: `Received top-up from CoCCA: ${payload.cocca_transaction_ref} | ${payload.registrar_name} | NGN ${amount}`,
    metadata:    { registrarId: payload.registrar_id, amount, paymentMethod: payload.payment_method },
    performedBy: 'cocca-webhook',
  });

  // Immediately try to post to SAGE (async, non-blocking)
  processTransaction(saved.id).catch(err =>
    logger.error('[TransactionService] Background SAGE post error', { id: saved.id, err: err.message })
  );

  return { duplicate: false, transaction: saved };
}

/**
 * Process a single transaction: look up mapping → post to SAGE → update status.
 */
async function processTransaction(transactionId) {
  const pool = await appPoolPromise;

  // Lock the row as 'processing'
  await pool.request()
    .input('id', sql.Int, transactionId)
    .query(`UPDATE transactions SET sync_status='processing', updated_at=GETDATE() WHERE id=@id`);

  // Fetch transaction
  const txnResult = await pool.request()
    .input('id', sql.Int, transactionId)
    .query(`SELECT * FROM transactions WHERE id=@id`);

  const txn = txnResult.recordset[0];
  if (!txn) throw new Error(`Transaction ${transactionId} not found`);

  // Fetch registrar mapping
  const mappingResult = await pool.request()
    .input('coccaId', sql.VarChar, txn.registrar_id)
    .query(`SELECT * FROM registrar_mappings WHERE cocca_id=@coccaId AND is_active=1`);

  if (mappingResult.recordset.length === 0) {
    await markFailed(transactionId, `No active registrar mapping found for CoCCA ID: ${txn.registrar_id}`);
    return;
  }

  const mapping = mappingResult.recordset[0];

  try {
    const { sageRef } = await postTransactionToSage(txn, mapping);

    // Mark as posted
    await pool.request()
      .input('id',       sql.Int,      transactionId)
      .input('sageRef',  sql.VarChar,  sageRef)
      .query(`
        UPDATE transactions
        SET sync_status='posted', sage_transaction_ref=@sageRef,
            sage_posted_at=GETDATE(), updated_at=GETDATE()
        WHERE id=@id
      `);

    await auditService.log({
      eventType:   auditService.EVENT_TYPES.SAGE_POST_SUCCESS,
      entityType:  'transaction',
      entityId:    transactionId,
      description: `Transaction posted to SAGE | CoCCA: ${txn.cocca_transaction_ref} | SAGE Ref: ${sageRef}`,
      metadata:    { sageRef, registrarId: txn.registrar_id, amount: txn.amount },
    });

    // Generate deferred revenue schedule if it's a domain registration
    if (txn.domain_name && txn.registration_years > 0) {
      await generateRevenueSchedule(txn);
    }

  } catch (err) {
    await markFailed(transactionId, err.message);
  }
}

async function markFailed(transactionId, errorMessage) {
  const pool = await appPoolPromise;

  const txnResult = await pool.request()
    .input('id', sql.Int, transactionId)
    .query(`SELECT retry_count, cocca_transaction_ref, registrar_id FROM transactions WHERE id=@id`);

  const txn = txnResult.recordset[0];
  const newRetryCount = (txn?.retry_count || 0) + 1;
  const isDead = newRetryCount >= parseInt(process.env.MAX_RETRY_ATTEMPTS || 3);

  await pool.request()
    .input('id',         sql.Int,      transactionId)
    .input('status',     sql.VarChar,  isDead ? 'dead' : 'failed')
    .input('error',      sql.NVarChar, errorMessage)
    .input('retryCount', sql.Int,      newRetryCount)
    .query(`
      UPDATE transactions
      SET sync_status=@status, last_error=@error,
          retry_count=@retryCount, updated_at=GETDATE()
      WHERE id=@id
    `);

  await auditService.log({
    eventType:   auditService.EVENT_TYPES.SAGE_POST_FAILED,
    entityType:  'transaction',
    entityId:    transactionId,
    description: `SAGE post failed (attempt ${newRetryCount}): ${errorMessage}`,
    metadata:    { isDead, retryCount: newRetryCount },
  });

  logger.error('[TransactionService] SAGE post failed', {
    transactionId, errorMessage, retryCount: newRetryCount, isDead,
  });
}

/**
 * Retry all 'failed' transactions (called by cron job).
 */
async function retryFailedTransactions() {
  const pool = await appPoolPromise;
  const maxRetries = parseInt(process.env.MAX_RETRY_ATTEMPTS || 3);

  const result = await pool.request()
    .input('maxRetries', sql.Int, maxRetries)
    .query(`
      SELECT id FROM transactions
      WHERE sync_status='failed' AND retry_count < @maxRetries
      ORDER BY created_at ASC
    `);

  const toRetry = result.recordset;
  logger.info(`[RetryJob] Found ${toRetry.length} transactions to retry`);

  for (const row of toRetry) {
    await auditService.log({
      eventType:   auditService.EVENT_TYPES.RETRY_TRIGGERED,
      entityType:  'transaction',
      entityId:    row.id,
      description: `Automatic retry triggered for transaction ${row.id}`,
    });
    await processTransaction(row.id);
  }
}

module.exports = { receiveTransaction, processTransaction, retryFailedTransactions };
