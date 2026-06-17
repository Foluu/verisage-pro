/**
 * VeriSage Pro – Express Application Entry Point
 */

const path      = require('path');
// Load .env by an absolute path (relative to this file) so it works no matter
// what the process working directory is — e.g. when launched as a Windows service.
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const logger        = require('./config/logger');
const authRoutes    = require('./routes/authRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const { txRouter, mapRouter, repRouter } = require('./routes/apiRoutes');
const { startScheduler } = require('./services/scheduler');

const app = express();

// ── Security & Parsing ──────────────────────────────────────────────────────
// contentSecurityPolicy disabled so the React build's bundled scripts/styles
// load in the browser (Helmet's default CSP blocks them and you get a blank page).
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined', {
  stream: { write: msg => logger.info(msg.trim()) },
}));

// ── Rate Limiting ───────────────────────────────────────────────────────────
// Strict limit on webhook endpoint to prevent flooding
const webhookLimiter = rateLimit({ windowMs: 60_000, max: 200 });
// Auth endpoint brute-force protection
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20 });

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',         authLimiter, authRoutes);
app.use('/api/webhook',      webhookLimiter, webhookRoutes);
app.use('/api/transactions', txRouter);
app.use('/api/mappings',     mapRouter);
app.use('/api/reports',      repRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'VeriSage Pro', timestamp: new Date().toISOString() });
});

// ── Serve the React dashboard (frontend build) ───────────────────────────────
// The build lives in the sibling "public" folder (../../public relative to this
// file → C:\VeriSagePro\public on the server).
const PUBLIC_DIR = path.join(__dirname, '../../public');
app.use(express.static(PUBLIC_DIR));

// SPA fallback: any non-API GET request returns index.html so client-side
// routing (e.g. /login, /dashboard) keeps working on a page refresh.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// 404 (only reached for unknown /api routes now that static serving is in place)
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
