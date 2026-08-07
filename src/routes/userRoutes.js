const express = require('express');
const controller = require('../controllers/userController');
const { protect, adminOnly, requireAdminTotp } = require('../middleware/authMiddleware');

const router = express.Router();
router.patch('/profile', protect, requireAdminTotp, controller.updateProfile);
router.get('/', protect, requireAdminTotp, adminOnly, controller.listUsers);
router.patch('/:id/status', protect, requireAdminTotp, adminOnly, controller.setUserStatus);
router.post('/:id/reset-code', protect, requireAdminTotp, adminOnly, controller.issueResetCode);

module.exports = router;
