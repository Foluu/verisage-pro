const router = require('express').Router();
const { body } = require('express-validator');
const { login, me } = require('../controllers/authController');
const { jwtAuth } = require('../middleware/jwtAuth');
const validate = require('../middleware/validate');

router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    validate,
  ],
  login
);

router.get('/me', jwtAuth, me);

module.exports = router;
