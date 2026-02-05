const express = require('express');
const router = express.Router();
const {
  getAttendances,
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceSummary,
} = require('../controllers/attendanceController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

router.get('/summary/:employeeId', getAttendanceSummary);

router
  .route('/')
  .get(getAttendances)
  .post(authorize('HR Administrator', 'Tenant Admin', 'Manager'), createAttendance);

router
  .route('/:id')
  .get(getAttendance)
  .put(authorize('HR Administrator', 'Tenant Admin', 'Manager'), updateAttendance)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deleteAttendance);

module.exports = router;
