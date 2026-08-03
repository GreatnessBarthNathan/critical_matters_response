const express = require('express');
const controller = require('../controllers/userController');
const { protect, pastorOnly } = require('../middleware/authMiddleware');

const router = express.Router();
router.patch('/profile', protect, controller.updateProfile);
router.get('/', protect, pastorOnly, controller.listUsers);
router.patch('/:id/status', protect, pastorOnly, controller.setUserStatus);

module.exports = router;
