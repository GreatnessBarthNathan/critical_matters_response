const express = require('express');
const controller = require('../controllers/auditController');
const { protect, pastorOnly, requirePastorTotp } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect, requirePastorTotp, pastorOnly);
router.get('/', controller.list);

module.exports = router;
