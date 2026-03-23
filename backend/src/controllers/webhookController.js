/**
 * VeriSage Pro – Webhook Controller
 * Receives inbound top-up transactions from CoCCA.
 * Protected by API Key middleware.
 */

const { receiveTransaction } = require('../services/transactionService');
const logger = require('../config/logger');

// POST /api/webhook/topup
const receiveTopUp = async (req, res) => {
  try {
    const payload = req.body;

    logger.info('[Webhook] Top-up received', {
      ref:       payload.cocca_transaction_ref,
      registrar: payload.registrar_name,
      amount:    payload.amount,
    });

    const result = await receiveTransaction(payload);

    if (result.duplicate) {
      return res.status(200).json({
        success:  true,
        message:  'Duplicate transaction – already processed',
        duplicate: true,
        id:       result.existingId,
      });
    }

    res.status(202).json({
      success:   true,
      message:   'Transaction received and queued for SAGE posting',
      id:        result.transaction.id,
      coccaRef:  payload.cocca_transaction_ref,
    });

  } catch (err) {
    logger.error('[Webhook] receiveTopUp error', { err: err.message });
    res.status(500).json({ success: false, error: 'Failed to process transaction' });
  }
};

// POST /api/webhook/topup/batch  (multiple transactions in one call)
const receiveTopUpBatch = async (req, res) => {
  const { transactions } = req.body;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(422).json({ success: false, error: 'transactions array is required' });
  }

  const results = [];
  for (const payload of transactions) {
    try {
      const result = await receiveTransaction(payload);
      results.push({ ref: payload.cocca_transaction_ref, status: 'accepted', ...result });
    } catch (err) {
      results.push({ ref: payload.cocca_transaction_ref, status: 'error', error: err.message });
    }
  }

  res.status(202).json({ success: true, processed: results.length, results });
};

module.exports = { receiveTopUp, receiveTopUpBatch };
