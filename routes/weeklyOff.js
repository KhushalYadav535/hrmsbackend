const express = require('express');
const router = express.Router();
const {
  getWeeklyOff,
  createWeeklyOff,
  updateWeeklyOff,
  deleteWeeklyOff,
  getEmployeeWeeklyOffCalendar,
} = require('../controllers/weeklyOffController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('ATTENDANCE')); // BRD: DM-037

router.get('/employee/:employeeId/calendar', getEmployeeWeeklyOffCalendar);
router.get('/', getWeeklyOff);
router.post('/', authorize('HR Administrator', 'Tenant Admin'), createWeeklyOff);
router.put('/:id', authorize('HR Administrator', 'Tenant Admin'), updateWeeklyOff);
router.delete('/:id', authorize('HR Administrator', 'Tenant Admin'), deleteWeeklyOff);

module.exports = router;
