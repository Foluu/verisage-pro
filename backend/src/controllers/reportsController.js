const { getIncomeReport, getIncomeAnalytics } = require('../services/incomeService');
const { appPoolPromise, sql } = require('../config/database');
const logger = require('../config/logger');

// GET /api/reports/income
const incomeReport = async (req, res) => {
  try {
    const data = await getIncomeReport({
      year:        req.query.year,
      registrarId: req.query.registrar_id,
    });
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[ReportsController] incomeReport error', { err: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/reports/analytics
const analytics = async (req, res) => {
  try {
    const data = await getIncomeAnalytics({ year: req.query.year });
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[ReportsController] analytics error', { err: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/reports/audit-logs
const auditLogs = async (req, res) => {
  try {
    const pool    = await appPoolPromise;
    const page    = parseInt(req.query.page  || 1);
    const limit   = parseInt(req.query.limit || 50);
    const offset  = (page - 1) * limit;
    const event   = req.query.event || null;

    const request = pool.request()
      .input('limit',  sql.Int, limit)
      .input('offset', sql.Int, offset);

    let where = 'WHERE 1=1';
    if (event) {
      request.input('event', sql.VarChar, event);
      where += ' AND event_type = @event';
    }

    const result = await request.query(`
      SELECT id, event_type, entity_type, entity_id, description,
             metadata, performed_by, ip_address, created_at
      FROM audit_logs
      ${where}
      ORDER BY created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT COUNT(*) AS total FROM audit_logs ${where};
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
    logger.error('[ReportsController] auditLogs error', { err: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { incomeReport, analytics, auditLogs };
