/**
 * VeriSage Pro – Audit Log Service
 * Writes structured events to the audit_logs table.
 */

const { appPoolPromise, sql } = require('../config/database');
const logger = require('../config/logger');

const EVENT_TYPES = {
  TRANSACTION_RECEIVED:  'TRANSACTION_RECEIVED',
  SAGE_POST_SUCCESS:     'SAGE_POST_SUCCESS',
  SAGE_POST_FAILED:      'SAGE_POST_FAILED',
  RETRY_TRIGGERED:       'RETRY_TRIGGERED',
  MAPPING_CREATED:       'MAPPING_CREATED',
  MAPPING_UPDATED:       'MAPPING_UPDATED',
  INCOME_RECOGNIZED:     'INCOME_RECOGNIZED',
  USER_LOGIN:            'USER_LOGIN',
  USER_LOGIN_FAILED:     'USER_LOGIN_FAILED',
  USER_CREATED:          'USER_CREATED',
};

async function log({ eventType, entityType, entityId, description, metadata, performedBy, ipAddress }) {
  try {
    const pool = await appPoolPromise;
    await pool.request()
      .input('eventType',   sql.VarChar,   eventType)
      .input('entityType',  sql.VarChar,   entityType  || null)
      .input('entityId',    sql.VarChar,   entityId    ? String(entityId) : null)
      .input('description', sql.NVarChar,  description)
      .input('metadata',    sql.NVarChar,  metadata ? JSON.stringify(metadata) : null)
      .input('performedBy', sql.VarChar,   performedBy || 'system')
      .input('ipAddress',   sql.VarChar,   ipAddress   || null)
      .query(`
        INSERT INTO audit_logs (event_type, entity_type, entity_id, description, metadata, performed_by, ip_address)
        VALUES (@eventType, @entityType, @entityId, @description, @metadata, @performedBy, @ipAddress)
      `);
  } catch (err) {
    // Audit log failure must never crash the main flow
    logger.error('[AuditLog] Failed to write audit log', { err: err.message });
  }
}

module.exports = { log, EVENT_TYPES };
