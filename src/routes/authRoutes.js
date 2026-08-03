const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/authController');
const { protect, requirePastorTotp } = require('../middleware/authMiddleware');
const { csrfToken } = require('../middleware/csrfMiddleware');
const { sendError } = require('../middleware/errorMiddleware');

function publicLimiter(limit, message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => sendError(req, res, 429, { code: 'RATE_LIMITED', message }),
  });
}

function createAuthRoutes({
  loginLimit = 100, totpLimit = 10, totpSetupLimit = 10, totpConfirmLimit = 10, recoveryLimit = 10,
} = {}) {
  const router = express.Router();
  router.get('/csrf', csrfToken);
  router.post('/login', publicLimiter(loginLimit, 'Too many sign-in attempts. Please wait a few minutes and try again.'), controller.login);
  router.post('/logout', controller.logout);
  router.get('/me', protect, controller.me);
  router.post('/totp/setup', publicLimiter(totpSetupLimit, 'Too many two-factor setup attempts. Please try again later.'), protect, controller.beginTotpSetup);
  router.post('/totp/confirm', publicLimiter(totpConfirmLimit, 'Too many two-factor confirmation attempts. Please try again later.'), protect, controller.confirmTotpSetup);
  router.post('/totp/verify-login', publicLimiter(totpLimit, 'Too many two-factor attempts. Please try again later.'), controller.verifyLoginTotp);
  router.post('/recovery-codes/regenerate', protect, requirePastorTotp, controller.regenerateRecoveryCodes);
  router.post('/recover-with-code', publicLimiter(recoveryLimit, 'Too many recovery attempts. Please try again later.'), controller.recoverWithCode);
  router.post('/assisted-reset', publicLimiter(recoveryLimit, 'Too many recovery attempts. Please try again later.'), controller.completeAssistedReset);
  router.patch('/change-password', protect, requirePastorTotp, controller.changePassword);
  return router;
}

module.exports = createAuthRoutes;
