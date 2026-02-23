const express = require('express');
const router = express.Router();
const {
  getLeaveEncashments,
  getLeaveEncashment,
  createLeaveEncashment,
  updateLeaveEncashment,
  approveLeaveEncashment,
  rejectLeaveEncashment,
  processLeaveEncashment,
  deleteLeaveEncashment,
} = require('../controllers/leaveEncashmentController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('LEAVE')); // BRD: DM-037

// BRD Requirement: Leave encashment management
router
  .route('/')
  .get(authorize('HR Administrator', 'Tenant Admin', 'Manager', 'Employee', 'Payroll Administrator', 'Finance Administrator', 'Super Admin'), getLeaveEncashments)
  .post(authorize('HR Administrator', 'Tenant Admin', 'Employee', 'Super Admin'), createLeaveEncashment);

router
  .route('/:id')
  .get(authorize('HR Administrator', 'Tenant Admin', 'Manager', 'Employee', 'Payroll Administrator', 'Finance Administrator', 'Super Admin'), getLeaveEncashment)
  .put(authorize('HR Administrator', 'Tenant Admin', 'Employee', 'Super Admin'), updateLeaveEncashment)
  .delete(authorize('HR Administrator', 'Tenant Admin', 'Employee', 'Super Admin'), deleteLeaveEncashment);

router
  .route('/:id/approve')
  .post(authorize('HR Administrator', 'Tenant Admin', 'Payroll Administrator', 'Super Admin'), approveLeaveEncashment);

router
  .route('/:id/reject')
  .post(authorize('HR Administrator', 'Tenant Admin', 'Payroll Administrator', 'Super Admin'), rejectLeaveEncashment);

router
  .route('/:id/process')
  .post(authorize('HR Administrator', 'Tenant Admin', 'Payroll Administrator', 'Finance Administrator', 'Super Admin'), processLeaveEncashment);

module.exports = router;
