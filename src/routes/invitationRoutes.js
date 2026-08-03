const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/invitationController');
const { protect, pastorOnly } = require('../middleware/authMiddleware');
const { csrfProtection } = require('../middleware/csrfMiddleware');

function publicLimiter(limit, message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { code: 'RATE_LIMITED', message },
  });
}

function createInvitationRoutes({ inspectLimit = 60, redeemLimit = 10 } = {}) {
  const router = express.Router();
  const pastorOnlyWithCsrf = [protect, pastorOnly, csrfProtection];

  router.get('/', protect, pastorOnly, controller.list);
  router.post('/', ...pastorOnlyWithCsrf, controller.create);
  router.delete('/:id', ...pastorOnlyWithCsrf, controller.revoke);
  router.get('/:token', publicLimiter(inspectLimit, 'Too many invitation inspection attempts. Please try again later.'), controller.inspect);
  router.post('/:token/redeem', publicLimiter(redeemLimit, 'Too many invitation redemption attempts. Please try again later.'), controller.redeem);

  return router;
}

module.exports = createInvitationRoutes;
