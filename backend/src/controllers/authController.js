const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { appPoolPromise, sql } = require('../config/database');
const auditService = require('../services/auditService');
const logger = require('../config/logger');

// POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const pool = await appPoolPromise;
    const result = await pool.request()
      .input('email', sql.VarChar, email.toLowerCase().trim())
      .query(`SELECT * FROM users WHERE email=@email AND is_active=1`);

    const user = result.recordset[0];

    if (!user) {
      await auditService.log({
        eventType:   auditService.EVENT_TYPES.USER_LOGIN_FAILED,
        description: `Failed login attempt for: ${email}`,
        ipAddress:   req.ip,
      });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await auditService.log({
        eventType:   auditService.EVENT_TYPES.USER_LOGIN_FAILED,
        description: `Invalid password for: ${email}`,
        ipAddress:   req.ip,
      });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Update last_login
    await pool.request()
      .input('id', sql.Int, user.id)
      .query(`UPDATE users SET last_login=GETDATE() WHERE id=@id`);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await auditService.log({
      eventType:   auditService.EVENT_TYPES.USER_LOGIN,
      entityType:  'user',
      entityId:    user.id,
      description: `User logged in: ${email}`,
      performedBy: email,
      ipAddress:   req.ip,
    });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.full_name, role: user.role },
    });
  } catch (err) {
    logger.error('[AuthController] Login error', { err: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/auth/me
const me = async (req, res) => {
  res.json({ success: true, user: req.user });
};

module.exports = { login, me };
