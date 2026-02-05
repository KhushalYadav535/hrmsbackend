const express = require('express');
const router = express.Router();
const {
  getAppraisalCycles,
  getActiveCycle,
  createAppraisalCycle,
  updateAppraisalCycle,
  activateCycle,
} = require('../controllers/appraisalCycleController');
const {
  getGoals,
  createGoal,
  updateGoal,
  approveGoal,
  updateGoalProgress,
} = require('../controllers/goalController');
const {
  getSelfAppraisals,
  createOrUpdateSelfAppraisal,
  submitSelfAppraisal,
} = require('../controllers/selfAppraisalController');
const {
  getManagerAppraisals,
  createManagerAppraisal,
  submitManagerAppraisal,
} = require('../controllers/managerAppraisalController');
const {
  getNormalizations,
  createNormalization,
  adjustRating,
  completeNormalization,
} = require('../controllers/normalizationController');
const {
  getPIPs,
  createPIP,
  approvePIP,
  acknowledgePIP,
} = require('../controllers/pipController');
const {
  getIDPs,
  createIDP,
  finalizeIDP,
} = require('../controllers/idpController');
const {
  getFeedbacks,
  createFeedback,
} = require('../controllers/feedbackController');
const {
  getFeedback360s,
  createFeedback360,
  submitPeerFeedback,
} = require('../controllers/feedback360Controller');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

// Appraisal Cycles
router
  .route('/cycles')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getAppraisalCycles)
  .post(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), createAppraisalCycle);

router
  .route('/cycles/active')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getActiveCycle);

router
  .route('/cycles/:id')
  .put(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), updateAppraisalCycle);

router
  .route('/cycles/:id/activate')
  .post(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), activateCycle);

// Goals
router
  .route('/goals')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getGoals)
  .post(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), createGoal);

router
  .route('/goals/:id')
  .put(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), updateGoal);

router
  .route('/goals/:id/approve')
  .post(authorize('Manager', 'HR Administrator', 'Tenant Admin', 'Super Admin'), approveGoal);

router
  .route('/goals/:id/progress')
  .put(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), updateGoalProgress);

// Self Appraisals
router
  .route('/self-appraisals')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getSelfAppraisals)
  .post(authorize('Employee', 'HR Administrator', 'Tenant Admin', 'Super Admin'), createOrUpdateSelfAppraisal);

router
  .route('/self-appraisals/:id/submit')
  .post(authorize('Employee', 'HR Administrator', 'Tenant Admin', 'Super Admin'), submitSelfAppraisal);

// Manager Appraisals
router
  .route('/manager-appraisals')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getManagerAppraisals)
  .post(authorize('Manager', 'HR Administrator', 'Tenant Admin', 'Super Admin'), createManagerAppraisal);

router
  .route('/manager-appraisals/:id/submit')
  .post(authorize('Manager', 'HR Administrator', 'Tenant Admin', 'Super Admin'), submitManagerAppraisal);

// Normalization
router
  .route('/normalizations')
  .get(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), getNormalizations)
  .post(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), createNormalization);

router
  .route('/normalizations/:id/adjust')
  .post(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), adjustRating);

router
  .route('/normalizations/:id/complete')
  .post(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), completeNormalization);

// PIPs
router
  .route('/pips')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getPIPs)
  .post(authorize('Manager', 'HR Administrator', 'Tenant Admin', 'Super Admin'), createPIP);

router
  .route('/pips/:id/approve')
  .post(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), approvePIP);

router
  .route('/pips/:id/acknowledge')
  .post(authorize('Employee', 'HR Administrator', 'Tenant Admin', 'Super Admin'), acknowledgePIP);

// IDPs
router
  .route('/idps')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getIDPs)
  .post(authorize('Manager', 'HR Administrator', 'Tenant Admin', 'Super Admin'), createIDP);

router
  .route('/idps/:id/finalize')
  .post(authorize('Manager', 'HR Administrator', 'Tenant Admin', 'Super Admin'), finalizeIDP);

// Continuous Feedback
router
  .route('/feedbacks')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getFeedbacks)
  .post(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), createFeedback);

// 360-Degree Feedback
router
  .route('/feedback-360')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getFeedback360s)
  .post(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), createFeedback360);

router
  .route('/feedback-360/:id/peer')
  .post(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), submitPeerFeedback);

module.exports = router;
