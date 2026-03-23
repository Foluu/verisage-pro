/**
 * VeriSage Pro – Database Migration
 * Run once: node src/config/migrate.js
 * Creates all application tables in VeriSage Pro's own database.
 */

const { appPoolPromise, sql } = require('./database');
const bcrypt = require('bcryptjs');

async function migrate() {
  const pool = await appPoolPromise;

  console.log('[Migrate] Running VeriSage Pro migrations...');

  // ── 1. Registrar Mappings ────────────────────────────────────────────────
  // Maps a CoCCA registrar_id to the corresponding SAGE account (DCLink)
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='registrar_mappings' AND xtype='U')
    CREATE TABLE registrar_mappings (
      id              INT IDENTITY(1,1) PRIMARY KEY,
      cocca_id        VARCHAR(100)  NOT NULL UNIQUE,
      cocca_name      NVARCHAR(255) NOT NULL,
      sage_account_id INT           NOT NULL,  -- SAGE Client.DCLink
      sage_account_name NVARCHAR(255) NOT NULL,
      is_active       BIT           NOT NULL DEFAULT 1,
      created_at      DATETIME      NOT NULL DEFAULT GETDATE(),
      updated_at      DATETIME      NOT NULL DEFAULT GETDATE()
    );
  `);

  // ── 2. Transactions (raw inbound from CoCCA) ─────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='transactions' AND xtype='U')
    CREATE TABLE transactions (
      id                     INT IDENTITY(1,1) PRIMARY KEY,
      cocca_transaction_ref  VARCHAR(100)   NOT NULL UNIQUE,
      registrar_id           VARCHAR(100)   NOT NULL,
      registrar_name         NVARCHAR(255)  NOT NULL,
      amount                 DECIMAL(18,2)  NOT NULL,
      vat_amount             DECIMAL(18,2)  NOT NULL DEFAULT 0,
      amount_excl_vat        DECIMAL(18,2)  NOT NULL,
      payment_method         VARCHAR(50)    NOT NULL,
      top_up_date            DATETIME       NOT NULL,
      package_name           NVARCHAR(255)  NULL,
      domain_name            NVARCHAR(255)  NULL,
      registration_years     INT            NULL DEFAULT 1,
      raw_payload            NVARCHAR(MAX)  NULL,  -- full JSON from CoCCA
      -- Sync state
      sync_status            VARCHAR(20)    NOT NULL DEFAULT 'pending',
        -- pending | processing | posted | failed | dead
      retry_count            INT            NOT NULL DEFAULT 0,
      sage_transaction_ref   VARCHAR(100)   NULL,  -- filled after successful post
      sage_posted_at         DATETIME       NULL,
      last_error             NVARCHAR(MAX)  NULL,
      created_at             DATETIME       NOT NULL DEFAULT GETDATE(),
      updated_at             DATETIME       NOT NULL DEFAULT GETDATE()
    );
  `);

  // ── 3. Audit Logs ────────────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='audit_logs' AND xtype='U')
    CREATE TABLE audit_logs (
      id            INT IDENTITY(1,1) PRIMARY KEY,
      event_type    VARCHAR(50)    NOT NULL,
        -- TRANSACTION_RECEIVED | SAGE_POST_SUCCESS | SAGE_POST_FAILED
        -- RETRY_TRIGGERED | MAPPING_CREATED | USER_LOGIN | etc.
      entity_type   VARCHAR(50)    NULL,
      entity_id     VARCHAR(100)   NULL,
      description   NVARCHAR(MAX)  NOT NULL,
      metadata      NVARCHAR(MAX)  NULL,  -- JSON
      performed_by  VARCHAR(100)   NULL,  -- 'system' or user email
      ip_address    VARCHAR(45)    NULL,
      created_at    DATETIME       NOT NULL DEFAULT GETDATE()
    );
  `);

  // ── 4. Deferred Revenue Schedules ────────────────────────────────────────
  // Accrual model: each domain registration generates monthly revenue entries
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='revenue_schedules' AND xtype='U')
    CREATE TABLE revenue_schedules (
      id                INT IDENTITY(1,1) PRIMARY KEY,
      transaction_id    INT            NOT NULL REFERENCES transactions(id),
      registrar_id      VARCHAR(100)   NOT NULL,
      domain_name       NVARCHAR(255)  NULL,
      package_name      NVARCHAR(255)  NULL,
      total_amount      DECIMAL(18,2)  NOT NULL,
      monthly_amount    DECIMAL(18,2)  NOT NULL,
      total_months      INT            NOT NULL,
      recognition_month DATE           NOT NULL,  -- 1st of each month
      is_recognized     BIT            NOT NULL DEFAULT 0,
      recognized_at     DATETIME       NULL,
      created_at        DATETIME       NOT NULL DEFAULT GETDATE()
    );
  `);

  // ── 5. NiRA Dashboard Users ──────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
    CREATE TABLE users (
      id            INT IDENTITY(1,1) PRIMARY KEY,
      email         VARCHAR(255)   NOT NULL UNIQUE,
      password_hash VARCHAR(255)   NOT NULL,
      full_name     NVARCHAR(255)  NOT NULL,
      role          VARCHAR(20)    NOT NULL DEFAULT 'viewer',
        -- admin | finance | viewer
      is_active     BIT            NOT NULL DEFAULT 1,
      last_login    DATETIME       NULL,
      created_at    DATETIME       NOT NULL DEFAULT GETDATE()
    );
  `);

  // ── Seed default admin user ──────────────────────────────────────────────
  const existing = await pool.request()
    .input('email', sql.VarChar, 'admin@nira.org.ng')
    .query(`SELECT id FROM users WHERE email = @email`);

  if (existing.recordset.length === 0) {
    const hash = await bcrypt.hash('ChangeMe@2025!', 12);
    await pool.request()
      .input('email',    sql.VarChar,   'admin@nira.org.ng')
      .input('hash',     sql.VarChar,   hash)
      .input('fullName', sql.NVarChar,  'NiRA Administrator')
      .input('role',     sql.VarChar,   'admin')
      .query(`
        INSERT INTO users (email, password_hash, full_name, role)
        VALUES (@email, @hash, @fullName, @role)
      `);
    console.log('[Migrate] Default admin created: admin@nira.org.ng / ChangeMe@2025!');
  }

  console.log('[Migrate] All tables ready.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('[Migrate] Fatal:', err);
  process.exit(1);
});
