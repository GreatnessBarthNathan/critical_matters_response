const express = require('express');
const controller = require('../controllers/invitationController');
const { protect, pastorOnly } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, pastorOnly, controller.list);
router.post('/', protect, pastorOnly, controller.create);
router.delete('/:id', protect, pastorOnly, controller.revoke);
router.get('/:token', controller.inspect);
router.post('/:token/redeem', controller.redeem);

module.exports = router;
