const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/authController');
const { protect, requirePastorTotp } = require('../middleware/authMiddleware');
const { csrfToken } = require('../middleware/csrfMiddleware');

function publicLimiter(limit, message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { code: 'RATE_LIMITED', message },
  });
}

function createAuthRoutes({ loginLimit = 100, totpLimit = 10, recoveryLimit = 10 } = {}) {
  const router = express.Router();
  router.get('/csrf', csrfToken);
  router.post('/login', publicLimiter(loginLimit, 'Too many sign-in attempts. Please wait a few minutes and try again.'), controller.login);
  router.post('/logout', controller.logout);
  router.post('/reset-password', publicLimiter(recoveryLimit, 'Too many recovery attempts. Please try again later.'), controller.resetPassword);
  router.get('/me', protect, controller.me);
  router.post('/totp/setup', protect, controller.beginTotpSetup);
  router.post('/totp/confirm', protect, controller.confirmTotpSetup);
  router.post('/totp/verify-login', publicLimiter(totpLimit, 'Too many two-factor attempts. Please try again later.'), controller.verifyLoginTotp);
  router.post('/recovery-codes/regenerate', protect, requirePastorTotp, controller.regenerateRecoveryCodes);
  router.post('/recover-with-code', publicLimiter(recoveryLimit, 'Too many recovery attempts. Please try again later.'), controller.recoverWithCode);
  router.post('/assisted-reset', publicLimiter(recoveryLimit, 'Too many recovery attempts. Please try again later.'), controller.completeAssistedReset);
  router.patch('/change-password', protect, requirePastorTotp, controller.changePassword);
  return router;
}

module.exports = createAuthRoutes;
