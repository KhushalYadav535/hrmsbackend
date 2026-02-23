const express = require('express');
const router = express.Router();
const {
  requestOvertime,
  approveOvertime,
  autoDetectOvertime,
  getOvertime,
} = require('../controllers/overtimeController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('ATTENDANCE')); // BRD: DM-037

router.post('/request', authorize('Employee', 'Manager'), requestOvertime);
router.patch('/:id/approve', authorize('Manager', 'HR Administrator', 'Tenant Admin'), approveOvertime);
router.post('/auto-detect', authorize('HR Administrator', 'Tenant Admin'), autoDetectOvertime);
router.get('/', getOvertime);

module.exports = router;
