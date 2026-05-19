/**
 * VeriSage Pro – Database Migration
 *
 * Safe to run multiple times — all CREATE TABLE statements are guarded
 * with IF NOT EXISTS. The ALTER TABLE block at the bottom adds the two
 * new columns (transaction_type, description) to any existing transactions
 * table that was created before this version of the migration.
 *
 * Run with:  node src/config/migrate.js
 */

const { appPoolPromise, sql } = require('./database');
const bcrypt = require('bcryptjs');

async function migrate() {
  const pool = await appPoolPromise;

  console.log('[Migrate] Running VeriSage Pro migrations...');

  // ── 1. Registrar Mappings ────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='registrar_mappings' AND xtype='U')
    CREATE TABLE registrar_mappings (
      id                INT IDENTITY(1,1) PRIMARY KEY,
      cocca_id          VARCHAR(100)   NOT NULL UNIQUE,
      cocca_name        NVARCHAR(255)  NOT NULL,
      sage_account_id   INT            NOT NULL,
      sage_account_name NVARCHAR(255)  NOT NULL,
      is_active         BIT            NOT NULL DEFAULT 1,
      created_at        DATETIME       NOT NULL DEFAULT GETDATE(),
      updated_at        DATETIME       NOT NULL DEFAULT GETDATE()
    );
  `);
  console.log('[Migrate] registrar_mappings: ready');

  // ── 2. Transactions ──────────────────────────────────────────────────────
  // Full schema including the two new NiRA-required fields:
  //   transaction_type  — the type of transaction (Registration, Renewal, etc.)
  //   description       — free-text description supplied by CoCCA
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='transactions' AND xtype='U')
    CREATE TABLE transactions (
      id                     INT IDENTITY(1,1) PRIMARY KEY,
      cocca_transaction_ref  VARCHAR(100)   NOT NULL UNIQUE,
      registrar_id           VARCHAR(100)   NOT NULL,
      registrar_name         NVARCHAR(255)  NOT NULL,

      -- NiRA required fields (added per requirements review)
      transaction_type       VARCHAR(50)    NOT NULL,
        -- Registration | Renewal | Auto Renewal | Restoration Fee |
        -- Transfer Fee | Refund | Adjustment | Bank Payment |
        -- CC Payment | Access Fee | CC Fees | Registrant Change Fee
      description            NVARCHAR(500)  NOT NULL,

      -- Financial fields
      amount                 DECIMAL(18,2)  NOT NULL,
      vat_amount             DECIMAL(18,2)  NOT NULL DEFAULT 0,
      amount_excl_vat        DECIMAL(18,2)  NOT NULL,
      payment_method         VARCHAR(50)    NULL,
      top_up_date            DATETIME       NOT NULL,

      -- Domain fields
      domain_name            NVARCHAR(255)  NOT NULL,
      package_name           NVARCHAR(255)  NULL,
      registration_years     INT            NULL DEFAULT 1,

      -- Raw inbound payload
      raw_payload            NVARCHAR(MAX)  NULL,

      -- Sync state
      sync_status            VARCHAR(20)    NOT NULL DEFAULT 'pending',
        -- pending | processing | posted | failed | dead
      retry_count            INT            NOT NULL DEFAULT 0,
      sage_transaction_ref   VARCHAR(100)   NULL,
      sage_posted_at         DATETIME       NULL,
      last_error             NVARCHAR(MAX)  NULL,
      created_at             DATETIME       NOT NULL DEFAULT GETDATE(),
      updated_at             DATETIME       NOT NULL DEFAULT GETDATE()
    );
  `);
  console.log('[Migrate] transactions: ready');

  // ── 2a. ALTER TABLE — add new columns to existing transactions table ──────
  // This block runs safely on databases created before this migration version.
  // Each ALTER is guarded so it only runs if the column does not already exist.

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'transactions' AND COLUMN_NAME = 'transaction_type'
    )
    ALTER TABLE transactions
      ADD transaction_type VARCHAR(50) NOT NULL
        CONSTRAINT DF_transactions_transaction_type DEFAULT 'Registration';
  `);
  console.log('[Migrate] transactions.transaction_type: ready');

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'transactions' AND COLUMN_NAME = 'description'
    )
    ALTER TABLE transactions
      ADD description NVARCHAR(500) NOT NULL
        CONSTRAINT DF_transactions_description DEFAULT '';
  `);
  console.log('[Migrate] transactions.description: ready');

  // Make domain_name NOT NULL on existing tables.
  // First backfill any existing NULL values, then alter the column.
  await pool.request().query(`
    UPDATE transactions
    SET domain_name = 'unknown'
    WHERE domain_name IS NULL;
  `);

  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'transactions'
        AND COLUMN_NAME = 'domain_name'
        AND IS_NULLABLE = 'YES'
    )
    ALTER TABLE transactions
      ALTER COLUMN domain_name NVARCHAR(255) NOT NULL;
  `);
  console.log('[Migrate] transactions.domain_name: NOT NULL enforced');

  // Make vat_amount NOT NULL on existing tables (it already has DEFAULT 0
  // so existing rows are already populated).
  await pool.request().query(`
    UPDATE transactions
    SET vat_amount = 0
    WHERE vat_amount IS NULL;
  `);
  console.log('[Migrate] transactions.vat_amount: backfilled nulls');

  // ── 3. Audit Logs ────────────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='audit_logs' AND xtype='U')
    CREATE TABLE audit_logs (
      id            INT IDENTITY(1,1) PRIMARY KEY,
      event_type    VARCHAR(50)    NOT NULL,
      entity_type   VARCHAR(50)    NULL,
      entity_id     VARCHAR(100)   NULL,
      description   NVARCHAR(MAX)  NOT NULL,
      metadata      NVARCHAR(MAX)  NULL,
      performed_by  VARCHAR(100)   NULL,
      ip_address    VARCHAR(45)    NULL,
      created_at    DATETIME       NOT NULL DEFAULT GETDATE()
    );
  `);
  console.log('[Migrate] audit_logs: ready');

  // ── 4. Deferred Revenue Schedules ────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='revenue_schedules' AND xtype='U')
    CREATE TABLE revenue_schedules (
      id                INT IDENTITY(1,1) PRIMARY KEY,
      transaction_id    INT            NOT NULL REFERENCES transactions(id),
      registrar_id      VARCHAR(100)   NOT NULL,
      domain_name       NVARCHAR(255)  NULL,
      package_name      NVARCHAR(255)  NULL,
      transaction_type  VARCHAR(50)    NULL,
      total_amount      DECIMAL(18,2)  NOT NULL,
      monthly_amount    DECIMAL(18,2)  NOT NULL,
      total_months      INT            NOT NULL,
      recognition_month DATE           NOT NULL,
      is_recognized     BIT            NOT NULL DEFAULT 0,
      recognized_at     DATETIME       NULL,
      created_at        DATETIME       NOT NULL DEFAULT GETDATE()
    );
  `);
  console.log('[Migrate] revenue_schedules: ready');

  // ── 5. Dashboard Users ───────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
    CREATE TABLE users (
      id            INT IDENTITY(1,1) PRIMARY KEY,
      email         VARCHAR(255)   NOT NULL UNIQUE,
      password_hash VARCHAR(255)   NOT NULL,
      full_name     NVARCHAR(255)  NOT NULL,
      role          VARCHAR(20)    NOT NULL DEFAULT 'viewer',
      is_active     BIT            NOT NULL DEFAULT 1,
      last_login    DATETIME       NULL,
      created_at    DATETIME       NOT NULL DEFAULT GETDATE()
    );
  `);
  console.log('[Migrate] users: ready');

  // ── Seed default admin ───────────────────────────────────────────────────
  const existing = await pool.request()
    .input('email', sql.VarChar, 'admin@nira.org.ng')
    .query(`SELECT id FROM users WHERE email = @email`);

  if (existing.recordset.length === 0) {
    const hash = await bcrypt.hash('ChangeMe@2025!', 12);
    await pool.request()
      .input('email',    sql.VarChar,  'admin@nira.org.ng')
      .input('hash',     sql.VarChar,  hash)
      .input('fullName', sql.NVarChar, 'NiRA Administrator')
      .input('role',     sql.VarChar,  'admin')
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