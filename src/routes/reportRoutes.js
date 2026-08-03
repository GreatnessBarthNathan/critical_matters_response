const express = require('express');
const controller = require('../controllers/reportController');
const { protect, pastorOnly, requirePastorTotp } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect, requirePastorTotp);
router.get('/stats', controller.getStats);
router.route('/').get(controller.listReports).post(controller.createReport);
router.route('/:id').get(controller.getReport).patch(controller.updateReport);
router.post('/:id/responses', controller.addResponse);
router.patch('/:id/status', pastorOnly, controller.updateStatus);

module.exports = router;
