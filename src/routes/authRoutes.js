const express = require('express');
const controller = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.post('/reset-password', controller.resetPassword);
router.get('/me', protect, controller.me);
router.patch('/change-password', protect, controller.changePassword);

module.exports = router;
