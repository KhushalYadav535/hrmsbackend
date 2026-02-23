const express = require('express');
const router = express.Router();
const {
  getHolidays,
  getHoliday,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  checkHoliday,
} = require('../controllers/holidayCalendarController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('LEAVE')); // BRD: DM-037 - Holiday calendar is part of Leave module

// BRD Requirement: Holiday calendar for sandwich leave detection
router
  .route('/')
  .get(authorize('HR Administrator', 'Tenant Admin', 'Manager', 'Employee', 'Super Admin'), getHolidays)
  .post(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), createHoliday);

router
  .route('/check')
  .get(authorize('HR Administrator', 'Tenant Admin', 'Manager', 'Employee', 'Super Admin'), checkHoliday);

router
  .route('/:id')
  .get(authorize('HR Administrator', 'Tenant Admin', 'Manager', 'Employee', 'Super Admin'), getHoliday)
  .put(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), updateHoliday)
  .delete(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), deleteHoliday);

module.exports = router;
