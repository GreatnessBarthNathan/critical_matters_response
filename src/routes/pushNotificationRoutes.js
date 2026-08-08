const express = require('express');
const controller = require('../controllers/pushNotificationController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.get('/public-key', controller.publicKey);
router.post('/subscriptions', controller.subscribe);
router.delete('/subscriptions', controller.unsubscribe);

module.exports = router;
