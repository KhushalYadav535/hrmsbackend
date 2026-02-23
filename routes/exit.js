const express = require('express');
const router = express.Router();
const {
  submitResignation,
  getSeparation,
  getMySeparation,
  acceptResignation,
  getClearances,
  markClearance,
  calculateFnf,
  createFnfSettlement,
  approveFnfSettlement,
  markFnfPaid,
  getAllExits,
} = require('../controllers/exitController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('EXIT_MGMT')); // BRD: DM-037 - Module access protection

// Employee routes
router.post('/resign', authorize('Employee'), submitResignation);
router.get('/my-separation', authorize('Employee'), getMySeparation);

// Common routes (accessible by employee and HR)
router.get('/:id', getSeparation);
router.get('/:id/clearances', getClearances);
router.get('/:id/fnf', calculateFnf);

// Manager/HR routes
router.patch('/:id/accept', authorize('Manager', 'HR Administrator', 'Tenant Admin', 'Super Admin'), acceptResignation);
router.patch('/:id/clearance/:dept', authorize('Manager', 'HR Administrator', 'Finance Administrator', 'Tenant Admin', 'Super Admin'), markClearance);

// HR/Finance routes
router.post('/:id/fnf', authorize('HR Administrator', 'Finance Administrator', 'Tenant Admin', 'Super Admin'), createFnfSettlement);
router.post('/:id/fnf/approve', authorize('HR Administrator', 'Finance Administrator', 'Tenant Admin', 'Super Admin'), approveFnfSettlement);
router.patch('/:id/fnf/pay', authorize('Finance Administrator', 'Tenant Admin', 'Super Admin'), markFnfPaid);

// Admin dashboard
router.get('/admin/all', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), getAllExits);

module.exports = router;
