const express = require('express');
const router = express.Router();
const {
  getAttendances,
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceSummary,
  checkIn,
  checkOut,
  getTodayAttendance,
} = require('../controllers/attendanceController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

// Check-in/Check-out routes (available to all authenticated users)
router.post('/checkin', checkIn);
router.post('/checkout', checkOut);
router.get('/today', getTodayAttendance);

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
