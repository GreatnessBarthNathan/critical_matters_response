const express = require('express');
const controller = require('../controllers/userController');
const { protect, techSupportOnly } = require('../middleware/authMiddleware');

const router = express.Router();
router.patch('/profile', protect, controller.updateProfile);
router.get('/', protect, techSupportOnly, controller.listUsers);
router.patch('/:id/status', protect, techSupportOnly, controller.setUserStatus);
router.post('/:id/reset-code', protect, techSupportOnly, controller.issueResetCode);

module.exports = router;
