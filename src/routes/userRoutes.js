const express = require('express');
const controller = require('../controllers/userController');
const { protect, pastorOnly, requirePastorTotp } = require('../middleware/authMiddleware');

const router = express.Router();
router.patch('/profile', protect, requirePastorTotp, controller.updateProfile);
router.get('/', protect, requirePastorTotp, pastorOnly, controller.listUsers);
router.patch('/:id/status', protect, requirePastorTotp, pastorOnly, controller.setUserStatus);
router.post('/:id/reset-code', protect, requirePastorTotp, pastorOnly, controller.issueResetCode);

module.exports = router;
