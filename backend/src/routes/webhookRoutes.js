const router = require('express').Router();
const { body } = require('express-validator');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const validate  = require('../middleware/validate');
const { receiveTopUp, receiveTopUpBatch } = require('../controllers/webhookController');

// All webhook routes require CoCCA API Key
router.use(apiKeyAuth);

// Validation rules for a single top-up
const topUpRules = [
  body('cocca_transaction_ref').notEmpty().trim(),
  body('registrar_id').notEmpty().trim(),
  body('registrar_name').notEmpty().trim(),
  body('amount').isFloat({ min: 0.01 }),
  body('payment_method').notEmpty().trim(),
  body('top_up_date').isISO8601(),
];

/**
 * POST /api/webhook/topup
 *
 * Expected payload from CoCCA:
 * {
 *   "cocca_transaction_ref": "TXN-2025-001234",
 *   "registrar_id": "REG-001",
 *   "registrar_name": "Acme Domains Ltd",
 *   "amount": 50000.00,
 *   "vat_amount": 7500.00,
 *   "amount_excl_vat": 42500.00,
 *   "payment_method": "bank_transfer",
 *   "top_up_date": "2025-01-15T10:30:00Z",
 *   "package_name": ".ng Domain Registration",
 *   "domain_name": "example.ng",
 *   "registration_years": 1
 * }
 */
router.post('/topup', topUpRules, validate, receiveTopUp);

/**
 * POST /api/webhook/topup/batch
 * { "transactions": [ ...array of top-up objects ] }
 */
router.post('/topup/batch', receiveTopUpBatch);

module.exports = router;
