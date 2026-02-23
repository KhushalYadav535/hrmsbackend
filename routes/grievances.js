const express = require('express');
const router = express.Router();
const {
  submitGrievance,
  getMyGrievances,
  getGrievance,
  getAllGrievances,
  assignGrievance,
  addComment,
  proposeResolution,
  approveResolution,
  submitFeedback,
  getDashboardStats,
} = require('../controllers/grievanceController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('GRIEVANCE')); // BRD: DM-037 - Module access protection

// Employee routes
router.post('/', authorize('Employee'), submitGrievance);
router.get('/my-grievances', authorize('Employee'), getMyGrievances);
router.post('/:id/feedback', authorize('Employee'), submitFeedback);

// Common routes
router.get('/:id', getGrievance);
router.post('/:id/comments', addComment);

// HR/Admin routes
router.get('/', authorize('HR Administrator', 'Tenant Admin', 'Manager', 'Super Admin'), getAllGrievances);
router.get('/dashboard/stats', authorize('HR Administrator', 'Tenant Admin', 'Manager', 'Super Admin'), getDashboardStats);
router.patch('/:id/assign', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), assignGrievance);
router.post('/:id/resolution', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), proposeResolution);
router.post('/:id/resolution/approve', authorize('HR Administrator', 'Tenant Admin', 'Finance Administrator', 'Super Admin'), approveResolution);

module.exports = router;
