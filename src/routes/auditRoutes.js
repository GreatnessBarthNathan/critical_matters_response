const express = require('express');
const controller = require('../controllers/auditController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect, adminOnly);
router.get('/', controller.list);

module.exports = router;
