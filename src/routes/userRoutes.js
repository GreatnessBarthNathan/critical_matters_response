const express = require('express');
const controller = require('../controllers/userController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();
router.patch('/profile', protect, controller.updateProfile);
router.get('/', protect, adminOnly, controller.listUsers);
router.patch('/:id/status', protect, adminOnly, controller.setUserStatus);
router.post('/:id/reset-code', protect, adminOnly, controller.issueResetCode);

module.exports = router;
