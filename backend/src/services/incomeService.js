/**
 * VeriSage Pro – Income Recognition Service (Accrual Model)
 *
 * Per RFP Section 5:
 *   NGN 6,000 / 1 year  → NGN 500/month for 12 months
 *   NGN 12,000 / 2 years → NGN 500/month for 24 months
 *
 * For each domain registration, this service generates monthly revenue_schedules rows.
 * A nightly cron job marks overdue rows as recognized (is_recognized = 1).
 */

const { appPoolPromise, sql } = require('../config/database');
const auditService = require('./auditService');
const logger = require('../config/logger');

/**
 * Generate monthly revenue recognition schedule for a domain registration.
 * Called immediately after a successful SAGE post.
 */
async function generateRevenueSchedule(txn) {
  const pool = await appPoolPromise;

  const totalMonths  = (txn.registration_years || 1) * 12;
  const totalAmount  = parseFloat(txn.amount_excl_vat); // Use excl. VAT for revenue
  const monthlyAmount = parseFloat((totalAmount / totalMonths).toFixed(2));

  // Start recognition from 1st of the following month
  const startDate = new Date(txn.top_up_date);
  startDate.setDate(1);
  startDate.setMonth(startDate.getMonth() + 1);

  const inserts = [];
  for (let i = 0; i < totalMonths; i++) {
    const recognitionMonth = new Date(startDate);
    recognitionMonth.setMonth(recognitionMonth.getMonth() + i);
    inserts.push(recognitionMonth);
  }

  for (const month of inserts) {
    await pool.request()
      .input('transactionId',  sql.Int,       txn.id)
      .input('registrarId',    sql.VarChar,   txn.registrar_id)
      .input('domainName',     sql.NVarChar,  txn.domain_name   || null)
      .input('packageName',    sql.NVarChar,  txn.package_name  || null)
      .input('totalAmount',    sql.Decimal,   totalAmount)
      .input('monthlyAmount',  sql.Decimal,   monthlyAmount)
      .input('totalMonths',    sql.Int,       totalMonths)
      .input('recognitionMonth', sql.Date,    month)
      .query(`
        INSERT INTO revenue_schedules
          (transaction_id, registrar_id, domain_name, package_name,
           total_amount, monthly_amount, total_months, recognition_month)
        VALUES
          (@transactionId, @registrarId, @domainName, @packageName,
           @totalAmount, @monthlyAmount, @totalMonths, @recognitionMonth)
      `);
  }

  logger.info('[IncomeService] Revenue schedule generated', {
    transactionId: txn.id,
    domain: txn.domain_name,
    months: totalMonths,
    monthlyAmount,
  });
}

/**
 * Run nightly: mark revenue_schedules rows whose recognition_month has passed as recognized.
 */
async function recognizeDueRevenue() {
  const pool = await appPoolPromise;

  const result = await pool.request().query(`
    UPDATE revenue_schedules
    SET is_recognized = 1, recognized_at = GETDATE()
    OUTPUT INSERTED.id, INSERTED.transaction_id, INSERTED.monthly_amount,
           INSERTED.registrar_id, INSERTED.recognition_month
    WHERE is_recognized = 0
      AND recognition_month <= CAST(GETDATE() AS DATE)
  `);

  const recognized = result.recordset;

  if (recognized.length > 0) {
    logger.info(`[IncomeService] Recognized ${recognized.length} revenue entries`);
    await auditService.log({
      eventType:   auditService.EVENT_TYPES.INCOME_RECOGNIZED,
      description: `Recognized ${recognized.length} deferred revenue entries`,
      metadata:    { count: recognized.length },
    });
  }

  return recognized;
}

/**
 * Monthly cumulative income recognition report for the dashboard.
 * Returns rows grouped by year-month, with optional filters.
 */
async function getIncomeReport({ year, registrarId } = {}) {
  const pool = await appPoolPromise;

  const request = pool.request();
  let whereClause = `WHERE is_recognized = 1`;

  if (year) {
    request.input('year', sql.Int, parseInt(year));
    whereClause += ` AND YEAR(recognition_month) = @year`;
  }
  if (registrarId) {
    request.input('registrarId', sql.VarChar, registrarId);
    whereClause += ` AND registrar_id = @registrarId`;
  }

  const result = await request.query(`
    SELECT
      FORMAT(recognition_month, 'yyyy-MM')  AS period,
      YEAR(recognition_month)               AS year,
      MONTH(recognition_month)              AS month,
      registrar_id,
      package_name,
      COUNT(*)                              AS entry_count,
      SUM(monthly_amount)                   AS recognized_amount,
      SUM(SUM(monthly_amount)) OVER (
        PARTITION BY YEAR(recognition_month)
        ORDER BY MIN(recognition_month)
        ROWS UNBOUNDED PRECEDING
      )                                     AS cumulative_ytd
    FROM revenue_schedules
    ${whereClause}
    GROUP BY
      FORMAT(recognition_month, 'yyyy-MM'),
      YEAR(recognition_month),
      MONTH(recognition_month),
      registrar_id,
      package_name
    ORDER BY period ASC
  `);

  return result.recordset;
}

/**
 * Analytics breakdown: income by registrar, by package, by month.
 */
async function getIncomeAnalytics({ year } = {}) {
  const pool = await appPoolPromise;
  const request = pool.request();

  let yearFilter = '';
  if (year) {
    request.input('year', sql.Int, parseInt(year));
    yearFilter = `AND YEAR(rs.recognition_month) = @year`;
  }

  // By registrar
  const byRegistrar = await request.query(`
    SELECT
      rs.registrar_id,
      rm.cocca_name AS registrar_name,
      SUM(rs.monthly_amount) AS total_recognized
    FROM revenue_schedules rs
    LEFT JOIN registrar_mappings rm ON rm.cocca_id = rs.registrar_id
    WHERE rs.is_recognized = 1 ${yearFilter}
    GROUP BY rs.registrar_id, rm.cocca_name
    ORDER BY total_recognized DESC
  `);

  // By package
  const byPackage = await pool.request()
    .query(`
      SELECT
        ISNULL(package_name, 'Unspecified') AS package_name,
        SUM(monthly_amount) AS total_recognized,
        COUNT(DISTINCT transaction_id) AS transaction_count
      FROM revenue_schedules
      WHERE is_recognized = 1
      GROUP BY package_name
      ORDER BY total_recognized DESC
    `);

  // Monthly trend (last 12 months)
  const trend = await pool.request().query(`
    SELECT TOP 12
      FORMAT(recognition_month, 'MMM yyyy') AS label,
      FORMAT(recognition_month, 'yyyy-MM')  AS period,
      SUM(monthly_amount) AS amount
    FROM revenue_schedules
    WHERE is_recognized = 1
    GROUP BY FORMAT(recognition_month, 'MMM yyyy'), FORMAT(recognition_month, 'yyyy-MM')
    ORDER BY period DESC
  `);

  return {
    byRegistrar: byRegistrar.recordset,
    byPackage:   byPackage.recordset,
    trend:       trend.recordset.reverse(),
  };
}

module.exports = {
  generateRevenueSchedule,
  recognizeDueRevenue,
  getIncomeReport,
  getIncomeAnalytics,
};
