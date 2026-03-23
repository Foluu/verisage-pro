const { appPoolPromise, sql } = require('../config/database');
const { processTransaction } = require('../services/transactionService');
const logger = require('../config/logger');

// GET /api/transactions  — paginated feed with filters
const getTransactions = async (req, res) => {
  try {
    const pool = await appPoolPromise;
    const page     = parseInt(req.query.page  || 1);
    const limit    = parseInt(req.query.limit || 20);
    const offset   = (page - 1) * limit;
    const status   = req.query.status   || null;
    const search   = req.query.search   || null;
    const fromDate = req.query.from     || null;
    const toDate   = req.query.to       || null;

    const request = pool.request()
      .input('limit',  sql.Int, limit)
      .input('offset', sql.Int, offset);

    let where = 'WHERE 1=1';

    if (status) {
      request.input('status', sql.VarChar, status);
      where += ' AND sync_status = @status';
    }
    if (search) {
      request.input('search', sql.NVarChar, `%${search}%`);
      where += ' AND (registrar_name LIKE @search OR cocca_transaction_ref LIKE @search OR domain_name LIKE @search)';
    }
    if (fromDate) {
      request.input('fromDate', sql.DateTime, new Date(fromDate));
      where += ' AND top_up_date >= @fromDate';
    }
    if (toDate) {
      request.input('toDate', sql.DateTime, new Date(toDate));
      where += ' AND top_up_date <= @toDate';
    }

    const result = await request.query(`
      SELECT
        id, cocca_transaction_ref, registrar_id, registrar_name,
        amount, vat_amount, amount_excl_vat, payment_method,
        top_up_date, package_name, domain_name, registration_years,
        sync_status, retry_count, sage_transaction_ref, sage_posted_at,
        last_error, created_at, updated_at
      FROM transactions
      ${where}
      ORDER BY created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT COUNT(*) AS total FROM transactions ${where};
    `);

    res.json({
      success: true,
      data:    result.recordsets[0],
      pagination: {
        page,
        limit,
        total: result.recordsets[1][0].total,
        pages: Math.ceil(result.recordsets[1][0].total / limit),
      },
    });
  } catch (err) {
    logger.error('[TransactionsController] getTransactions error', { err: err.message });
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
};

// GET /api/transactions/stats  — summary counts for dashboard cards
const getStats = async (req, res) => {
  try {
    const pool = await appPoolPromise;
    const result = await pool.request().query(`
      SELECT
        COUNT(*)                                         AS total,
        SUM(CASE WHEN sync_status='posted'     THEN 1 ELSE 0 END) AS posted,
        SUM(CASE WHEN sync_status='pending'    THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN sync_status='processing' THEN 1 ELSE 0 END) AS processing,
        SUM(CASE WHEN sync_status='failed'     THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN sync_status='dead'       THEN 1 ELSE 0 END) AS dead,
        SUM(CASE WHEN sync_status='posted'     THEN amount ELSE 0 END) AS total_posted_amount,
        SUM(amount)                                      AS total_amount,
        SUM(CASE WHEN CAST(top_up_date AS DATE)=CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS today_count,
        SUM(CASE WHEN CAST(top_up_date AS DATE)=CAST(GETDATE() AS DATE) THEN amount ELSE 0 END) AS today_amount
      FROM transactions
    `);
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    logger.error('[TransactionsController] getStats error', { err: err.message });
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
};

// POST /api/transactions/:id/retry
const retryTransaction = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await appPoolPromise;

    const existing = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT id, sync_status FROM transactions WHERE id=@id`);

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const txn = existing.recordset[0];
    if (txn.sync_status === 'posted') {
      return res.status(400).json({ success: false, error: 'Transaction already posted' });
    }

    // Reset for retry
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE transactions SET sync_status='pending', retry_count=0, last_error=NULL, updated_at=GETDATE() WHERE id=@id`);

    processTransaction(id).catch(err =>
      logger.error('[TransactionsController] Manual retry error', { id, err: err.message })
    );

    res.json({ success: true, message: 'Retry initiated' });
  } catch (err) {
    logger.error('[TransactionsController] retryTransaction error', { err: err.message });
    res.status(500).json({ success: false, error: 'Failed to retry transaction' });
  }
};

module.exports = { getTransactions, getStats, retryTransaction };
