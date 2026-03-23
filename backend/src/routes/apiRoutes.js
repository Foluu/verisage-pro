// ── Transactions ──────────────────────────────────────────────────────────────
const txRouter = require('express').Router();
const { jwtAuth } = require('../middleware/jwtAuth');
const { getTransactions, getStats, retryTransaction } = require('../controllers/transactionsController');

txRouter.use(jwtAuth);
txRouter.get('/',          getTransactions);
txRouter.get('/stats',     getStats);
txRouter.post('/:id/retry', retryTransaction);

// ── Registrar Mappings ────────────────────────────────────────────────────────
const mapRouter = require('express').Router();
const { requireRole } = require('../middleware/jwtAuth');
const { getMappings, createMapping, updateMapping, getSageAccounts } = require('../controllers/mappingsController');

mapRouter.use(jwtAuth);
mapRouter.get('/',                getMappings);
mapRouter.get('/sage-accounts',   getSageAccounts);
mapRouter.post('/',               requireRole(['admin', 'finance']), createMapping);
mapRouter.put('/:id',             requireRole(['admin', 'finance']), updateMapping);

// ── Reports ───────────────────────────────────────────────────────────────────
const repRouter = require('express').Router();
const { incomeReport, analytics, auditLogs } = require('../controllers/reportsController');

repRouter.use(jwtAuth);
repRouter.get('/income',     incomeReport);
repRouter.get('/analytics',  analytics);
repRouter.get('/audit-logs', auditLogs);

module.exports = { txRouter, mapRouter, repRouter };
