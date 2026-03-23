/**
 * VeriSage Pro – Scheduled Jobs
 *
 * 1. Every 5 minutes: retry 'failed' transactions
 * 2. Daily at midnight: recognize due deferred revenue entries
 */

const cron = require('node-cron');
const { retryFailedTransactions } = require('../services/transactionService');
const { recognizeDueRevenue }     = require('../services/incomeService');
const logger = require('../config/logger');

function startScheduler() {
  // ── Retry failed SAGE posts ─────────────────────────────────────────────
  const retryCron = process.env.RETRY_CRON || '*/5 * * * *';
  cron.schedule(retryCron, async () => {
    logger.debug('[Scheduler] Running retry job...');
    try {
      await retryFailedTransactions();
    } catch (err) {
      logger.error('[Scheduler] Retry job error', { err: err.message });
    }
  });

  // ── Nightly income recognition ──────────────────────────────────────────
  const incomeCron = process.env.INCOME_RECOGNITION_CRON || '0 0 * * *';
  cron.schedule(incomeCron, async () => {
    logger.info('[Scheduler] Running income recognition job...');
    try {
      await recognizeDueRevenue();
    } catch (err) {
      logger.error('[Scheduler] Income recognition error', { err: err.message });
    }
  });

  logger.info(`[Scheduler] Jobs started | Retry: ${retryCron} | Income: ${incomeCron}`);
}

module.exports = { startScheduler };
