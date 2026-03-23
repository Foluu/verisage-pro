/**
 * VeriSage Pro – Database Configuration
 *
 * Pattern inherited from reference project:
 *   - Singleton poolPromise: connect once, reuse everywhere
 *   - Two separate pools:
 *       1. appPool  → VeriSage Pro's own SQL Server DB (logs, mappings, schedules)
 *       2. sagePool → SAGE 200 Evolution on-premise SQL Server
 */

const sql = require('mssql');
require('dotenv').config();

// ─── VeriSage Pro's Own Database ─────────────────────────────────────────────
const appDbConfig = {
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server:   process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port:     parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt:          false,
    enableArithAbort: true,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
  },
};

// ─── SAGE 200 Evolution Database ─────────────────────────────────────────────
const sageDbConfig = {
  user:     process.env.SAGE_DB_USER,
  password: process.env.SAGE_DB_PASSWORD,
  server:   process.env.SAGE_DB_SERVER,
  database: process.env.SAGE_DB_DATABASE,
  port:     parseInt(process.env.SAGE_DB_PORT || '1433'),
  options: {
    encrypt:          false,
    enableArithAbort: true,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
  },
};

// ─── Singleton Pool Promises ──────────────────────────────────────────────────
const appPoolPromise = new sql.ConnectionPool(appDbConfig)
  .connect()
  .then(pool => {
    console.log('[DB] Connected to VeriSage Pro database');
    return pool;
  })
  .catch(err => {
    console.error('[DB] VeriSage Pro database connection failed:', err.message);
    process.exit(1);
  });

const sagePoolPromise = new sql.ConnectionPool(sageDbConfig)
  .connect()
  .then(pool => {
    console.log('[DB] Connected to SAGE 200 Evolution database');
    return pool;
  })
  .catch(err => {
    console.error('[DB] SAGE database connection failed:', err.message);
    // Don't exit – SAGE may be temporarily unavailable; queued transactions will retry
  });

module.exports = { appPoolPromise, sagePoolPromise, sql };
