const express = require('express');
const controller = require('../controllers/auditController');
const { protect, adminOnly, requireAdminTotp } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect, requireAdminTotp, adminOnly);
router.get('/', controller.list);

module.exports = router;
