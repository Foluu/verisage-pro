const { appPoolPromise, sagePoolPromise, sql } = require('../config/database');
const auditService = require('../services/auditService');
const logger = require('../config/logger');

// GET /api/mappings
const getMappings = async (req, res) => {
  try {
    const pool = await appPoolPromise;
    const result = await pool.request().query(`
      SELECT id, cocca_id, cocca_name, sage_account_id, sage_account_name, is_active, created_at, updated_at
      FROM registrar_mappings
      ORDER BY cocca_name ASC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/mappings
const createMapping = async (req, res) => {
  try {
    const { cocca_id, cocca_name, sage_account_id, sage_account_name } = req.body;
    const pool = await appPoolPromise;

    const result = await pool.request()
      .input('coccaId',           sql.VarChar,  cocca_id)
      .input('coccaName',         sql.NVarChar, cocca_name)
      .input('sageAccountId',     sql.Int,      sage_account_id)
      .input('sageAccountName',   sql.NVarChar, sage_account_name)
      .query(`
        INSERT INTO registrar_mappings (cocca_id, cocca_name, sage_account_id, sage_account_name)
        OUTPUT INSERTED.*
        VALUES (@coccaId, @coccaName, @sageAccountId, @sageAccountName)
      `);

    const mapping = result.recordset[0];

    await auditService.log({
      eventType:   auditService.EVENT_TYPES.MAPPING_CREATED,
      entityType:  'mapping',
      entityId:    mapping.id,
      description: `Registrar mapping created: ${cocca_name} → SAGE ${sage_account_name}`,
      performedBy: req.user?.email,
      ipAddress:   req.ip,
    });

    res.status(201).json({ success: true, data: mapping });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'CoCCA ID already mapped' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
};

// PUT /api/mappings/:id
const updateMapping = async (req, res) => {
  try {
    const { cocca_name, sage_account_id, sage_account_name, is_active } = req.body;
    const pool = await appPoolPromise;

    const result = await pool.request()
      .input('id',               sql.Int,      req.params.id)
      .input('coccaName',        sql.NVarChar, cocca_name)
      .input('sageAccountId',    sql.Int,      sage_account_id)
      .input('sageAccountName',  sql.NVarChar, sage_account_name)
      .input('isActive',         sql.Bit,      is_active ? 1 : 0)
      .query(`
        UPDATE registrar_mappings
        SET cocca_name=@coccaName, sage_account_id=@sageAccountId,
            sage_account_name=@sageAccountName, is_active=@isActive,
            updated_at=GETDATE()
        OUTPUT INSERTED.*
        WHERE id=@id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Mapping not found' });
    }

    await auditService.log({
      eventType:   auditService.EVENT_TYPES.MAPPING_UPDATED,
      entityType:  'mapping',
      entityId:    req.params.id,
      description: `Registrar mapping updated: ${cocca_name}`,
      performedBy: req.user?.email,
    });

    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/mappings/sage-accounts — fetch SAGE client accounts for the mapping UI dropdown
const getSageAccounts = async (req, res) => {
  try {
    const pool = await sagePoolPromise;
    if (!pool) {
      return res.status(503).json({ success: false, error: 'SAGE database not available' });
    }
    const result = await pool.request().query(`
      SELECT TOP 500 DCLink AS id, Name AS name, Account AS code
      FROM Client
      WHERE Name IS NOT NULL
      ORDER BY Name ASC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    logger.error('[MappingsController] getSageAccounts error', { err: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getMappings, createMapping, updateMapping, getSageAccounts };
