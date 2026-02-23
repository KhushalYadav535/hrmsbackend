const express = require('express');
const router = express.Router();
const {
  getShifts,
  createShift,
  assignShift,
  getEmployeeShift,
  getShiftRoster,
} = require('../controllers/shiftController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('ATTENDANCE')); // BRD: DM-037

router.get('/', authorize('HR Administrator', 'Tenant Admin', 'Manager'), getShifts);
router.post('/', authorize('HR Administrator', 'Tenant Admin'), createShift);
router.post('/assign', authorize('HR Administrator', 'Tenant Admin'), assignShift);
router.get('/employee/:employeeId', getEmployeeShift);
router.get('/roster', authorize('HR Administrator', 'Tenant Admin'), getShiftRoster);

module.exports = router;
