const express = require('express');
const router = express.Router();
const { getSystemStatus } = require('../controllers/systemController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

router.get('/status', authorize('Tenant Admin', 'Super Admin'), getSystemStatus);

module.exports = router;
