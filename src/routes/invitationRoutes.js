const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/invitationController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { csrfProtection } = require('../middleware/csrfMiddleware');
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

function createInvitationRoutes({ inspectLimit = 60, redeemLimit = 10 } = {}) {
  const router = express.Router();
  const adminOnlyWithCsrf = [protect, adminOnly, csrfProtection];

  router.get('/', protect, adminOnly, controller.list);
  router.post('/', ...adminOnlyWithCsrf, controller.create);
  router.delete('/:id', ...adminOnlyWithCsrf, controller.revoke);
  router.get('/:token', publicLimiter(inspectLimit, 'Too many invitation inspection attempts. Please try again later.'), controller.inspect);
  router.post('/:token/redeem', publicLimiter(redeemLimit, 'Too many invitation redemption attempts. Please try again later.'), controller.redeem);

  return router;
}

module.exports = createInvitationRoutes;
