const express = require('express');
const router = express.Router();
const {
  getWeeklyOff,
  createWeeklyOff,
  getEmployeeWeeklyOffCalendar,
} = require('../controllers/weeklyOffController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('ATTENDANCE')); // BRD: DM-037

router.get('/', getWeeklyOff);
router.post('/', authorize('HR Administrator', 'Tenant Admin'), createWeeklyOff);
router.get('/employee/:employeeId/calendar', getEmployeeWeeklyOffCalendar);

module.exports = router;
