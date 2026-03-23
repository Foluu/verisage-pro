/**
 * VeriSage Pro – Express Application Entry Point
 */

require('dotenv').config();
const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');
const morgan   = require('morgan');
const rateLimit = require('express-rate-limit');

const logger   = require('./config/logger');
const authRoutes    = require('./routes/authRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const { txRouter, mapRouter, repRouter } = require('./routes/apiRoutes');
const { startScheduler } = require('./services/scheduler');

const app = express();

// ── Security & Parsing ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined', {
  stream: { write: msg => logger.info(msg.trim()) },
}));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// Strict limit on webhook endpoint to prevent flooding
const webhookLimiter = rateLimit({ windowMs: 60_000, max: 200 });
// Auth endpoint brute-force protection
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20 });

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',         authLimiter, authRoutes);
app.use('/api/webhook',      webhookLimiter, webhookRoutes);
app.use('/api/transactions', txRouter);
app.use('/api/mappings',     mapRouter);
app.use('/api/reports',      repRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'VeriSage Pro', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, _next) => {
  logger.error('[App] Unhandled error', { err: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`[App] VeriSage Pro running on port ${PORT}`);
  startScheduler();
});

module.exports = app;
