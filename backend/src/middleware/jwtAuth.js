/**
 * VeriSage Pro – JWT Auth Middleware
 * Protects all NiRA dashboard API endpoints.
 */

const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

const jwtAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Bearer token required',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role, iat, exp }
    next();
  } catch (err) {
    logger.warn('[JwtAuth] Invalid/expired token', { err: err.message, ip: req.ip });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or expired token',
    });
  }
};

// Role guard factory: requireRole('admin') or requireRole(['admin','finance'])
const requireRole = (roles) => (req, res, next) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Insufficient permissions',
    });
  }
  next();
};

module.exports = { jwtAuth, requireRole };
