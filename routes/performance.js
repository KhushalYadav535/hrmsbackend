const express = require('express');
const router = express.Router();
const {
  getPerformances,
  getPerformance,
  createPerformance,
  updatePerformance,
  deletePerformance,
} = require('../controllers/performanceController');
const {
  createCycle,
  activateCycle,
  getMyAppraisal,
  submitSelfAssessment,
  submitManagerReview,
  normalizeRatings,
  getManagerAppraisals,
  getAllAppraisals,
  getCycles,
} = require('../controllers/appraisalController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('PERFORMANCE')); // BRD: DM-037 - Module access protection

// New Appraisal Workflow Routes (BR-P1-001) - MUST be defined BEFORE /:id route
router.get('/cycles', getCycles);
router.post('/cycles', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), createCycle);
router.patch('/cycles/:id/activate', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), activateCycle);

router.get('/my-appraisal', authorize('Employee'), getMyAppraisal);
router.post('/:id/self-assessment', authorize('Employee'), submitSelfAssessment);

router.get('/manager/appraisals', authorize('Manager', 'HR Administrator', 'Tenant Admin'), getManagerAppraisals);
router.post('/:id/manager-review', authorize('Manager', 'HR Administrator', 'Tenant Admin'), submitManagerReview);

router.post('/normalize', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), normalizeRatings);
router.get('/admin/all', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), getAllAppraisals);

// Legacy routes (backward compatibility) - MUST be defined AFTER specific routes
router
  .route('/')
  .get(getPerformances)
  .post(authorize('Manager', 'HR Administrator', 'Tenant Admin'), createPerformance);

router
  .route('/:id')
  .get(getPerformance)
  .put(authorize('Manager', 'HR Administrator', 'Tenant Admin'), updatePerformance)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deletePerformance);

module.exports = router;
