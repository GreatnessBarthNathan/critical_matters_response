const express = require('express');
const controller = require('../controllers/pushNotificationController');
const { protect, reportParticipantOnly } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(reportParticipantOnly);
router.get('/public-key', controller.publicKey);
router.post('/subscriptions', controller.subscribe);
router.delete('/subscriptions', controller.unsubscribe);

module.exports = router;
