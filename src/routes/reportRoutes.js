const express = require('express');
const controller = require('../controllers/reportController');
const { protect, adminOnly, requireAdminTotp } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect, requireAdminTotp);
router.get('/stats', controller.getStats);
router.route('/').get(controller.listReports).post(controller.createReport);
router.route('/:id').get(controller.getReport).patch(controller.updateReport);
router.post('/:id/responses', controller.addResponse);
router.patch('/:id/status', adminOnly, controller.updateStatus);

module.exports = router;
