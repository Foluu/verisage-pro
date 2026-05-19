const router = require('express').Router();
const { body } = require('express-validator');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const validate  = require('../middleware/validate');
const { receiveTopUp, receiveTopUpBatch } = require('../controllers/webhookController');

// All webhook routes require CoCCA API Key
router.use(apiKeyAuth);

// ── Accepted transaction types ────────────────────────────────────────────────
const VALID_TRANSACTION_TYPES = [
  'Registration',
  'Renewal',
  'Auto Renewal',
  'Restoration Fee',
  'Transfer Fee',
  'Refund',
  'Adjustment',
  'Bank Payment',
  'CC Payment',
  'Access Fee',
  'CC Fees',
  'Registrant Change Fee',
];

// ── Validation rules for a single transaction ─────────────────────────────────
const topUpRules = [
  // Identifiers
  body('cocca_transaction_ref')
    .notEmpty().withMessage('cocca_transaction_ref is required')
    .trim(),

  body('registrar_id')
    .notEmpty().withMessage('registrar_id is required')
    .trim(),

  // Client Name (NiRA field: "Client Name")
  body('registrar_name')
    .notEmpty().withMessage('registrar_name (Client Name) is required')
    .trim(),

  // Transaction Type (NiRA required field)
  body('transaction_type')
    .notEmpty().withMessage('transaction_type is required')
    .isIn(VALID_TRANSACTION_TYPES)
    .withMessage(`transaction_type must be one of: ${VALID_TRANSACTION_TYPES.join(', ')}`),

  // Domain Name (NiRA required field)
  // Required for domain-related types; for financial types (Bank Payment,
  // CC Payment, Adjustment, etc.) send the primary domain or account identifier.
  body('domain_name')
    .notEmpty().withMessage('domain_name is required')
    .trim(),

  // Amount (NiRA field: "Amount")
  body('amount')
    .isFloat({ min: 0.01 }).withMessage('amount must be a positive number'),

  // Tax (NiRA field: "Tax") — required, send 0 for tax-exempt transactions
  body('vat_amount')
    .notEmpty().withMessage('vat_amount (Tax) is required')
    .isFloat({ min: 0 }).withMessage('vat_amount must be a non-negative number'),

  // Description (NiRA required field)
  body('description')
    .notEmpty().withMessage('description is required')
    .trim(),

  // Date
  body('top_up_date')
    .isISO8601().withMessage('top_up_date must be a valid ISO 8601 timestamp (e.g. 2025-06-01T10:00:00Z)'),

  // Optional fields
  body('payment_method').optional().trim(),
  body('amount_excl_vat').optional().isFloat({ min: 0 }),
  body('package_name').optional().trim(),
  body('registration_years').optional().isInt({ min: 1, max: 10 }),
];

/**
 * POST /api/webhook/topup
 *
 * Expected payload from CoCCA:
 * {
 *   "cocca_transaction_ref": "TXN-2025-001234",
 *   "registrar_id":          "REG-001",
 *   "registrar_name":        "Acme Domains Ltd",
 *   "transaction_type":      "Registration",
 *   "domain_name":           "example.ng",
 *   "description":           "New .ng domain registration for example.ng - 1 year",
 *   "amount":                6450.00,
 *   "vat_amount":            450.00,
 *   "amount_excl_vat":       6000.00,
 *   "payment_method":        "bank_transfer",
 *   "top_up_date":           "2025-06-01T10:00:00Z",
 *   "package_name":          ".ng Domain Registration - 1 Year",
 *   "registration_years":    1
 * }
 *
 * Valid transaction_type values:
 *   Registration | Renewal | Auto Renewal | Restoration Fee | Transfer Fee |
 *   Refund | Adjustment | Bank Payment | CC Payment | Access Fee |
 *   CC Fees | Registrant Change Fee
 *
 * Notes:
 *   - vat_amount is required; send 0.00 for VAT-exempt transactions.
 *   - domain_name is required on all transaction types. For non-domain
 *     financial transactions (e.g. Bank Payment), send the registrar's
 *     primary domain or account name.
 *   - Refund transactions are posted to SAGE as Credit Notes (DocType 3).
 *     All other types are posted as Receipts (DocType 2).
 */
router.post('/topup', topUpRules, validate, receiveTopUp);

/**
 * POST /api/webhook/topup/batch
 * Body: { "transactions": [ ...array of transaction objects ] }
 * Each object must follow the same structure as the single /topup endpoint.
 * Maximum recommended batch size: 100 transactions per request.
 */
router.post('/topup/batch', receiveTopUpBatch);

module.exports = router;