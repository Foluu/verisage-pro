/**
 * VeriSage Pro – API Key Middleware
 * Protects CoCCA inbound webhook endpoints.
 * CoCCA must send:  X-API-Key: <COCCA_API_KEY from .env>
 */

const logger = require('../config/logger');

const apiKeyAuth = (req, res, next) => {
  const providedKey = req.headers['x-api-key'];

  if (!providedKey) {
    logger.warn('[ApiKeyAuth] Missing X-API-Key header', { ip: req.ip, path: req.path });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: X-API-Key header is required',
    });
  }

  if (providedKey !== process.env.COCCA_API_KEY) {
    logger.warn('[ApiKeyAuth] Invalid API key attempt', { ip: req.ip, path: req.path });
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Invalid API key',
    });
  }

  next();
};

module.exports = apiKeyAuth;
