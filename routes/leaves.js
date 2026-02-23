const express = require('express');
const router = express.Router();
const {
  getLeaves,
  getLeave,
  createLeave,
  updateLeave,
  approveLeave,
  deleteLeave,
  getLeaveBalance,
  cancelLeave,
  getTeamCalendar,
} = require('../controllers/leaveController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('LEAVE')); // BRD: DM-037 - Module access protection

router
  .route('/')
  .get(getLeaves)
  .post(createLeave);

router.get('/balance/:employeeId', getLeaveBalance);

// Leave accrual route
router
  .route('/accrue')
  .post(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), require('../controllers/leaveAccrualController').accrueLeaves);

router
  .route('/:id')
  .get(getLeave)
  .put(updateLeave)
  .delete(deleteLeave);

router
  .route('/:id/approve')
  .put(authorize('Manager', 'HR Administrator', 'Tenant Admin'), approveLeave);

router
  .route('/:id/cancel')
  .put(cancelLeave);

router
  .route('/team-calendar')
  .get(authorize('Manager', 'HR Administrator', 'Tenant Admin', 'Super Admin'), getTeamCalendar);

module.exports = router;
