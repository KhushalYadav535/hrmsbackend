const express = require('express');
const router = express.Router();
const {
  getTravelRequests,
  getTravelRequest,
  createTravelRequest,
  updateTravelRequest,
  submitTravelRequest,
  approveTravelRequest,
  deleteTravelRequest,
} = require('../controllers/travelRequestController');
const {
  getTravelAdvances,
  createTravelAdvance,
  approveTravelAdvance,
  rejectTravelAdvance,
  markTravelAdvancePaid,
} = require('../controllers/travelAdvanceController');
const {
  getTravelClaims,
  createTravelClaim,
  submitTravelClaim,
  approveTravelClaim,
  rejectTravelClaim,
  settleTravelClaim,
} = require('../controllers/travelClaimController');
const {
  getTravelPolicies,
  createTravelPolicy,
  updateTravelPolicy,
  deleteTravelPolicy,
} = require('../controllers/travelPolicyController');
const {
  getLTAs,
  getLTABalance,
  createLTA,
  addLTAJourney,
  approveLTAJourney,
} = require('../controllers/ltaController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

// Travel Request Routes
router
  .route('/requests')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getTravelRequests)
  .post(authorize('Employee', 'HR Administrator', 'Tenant Admin', 'Super Admin'), createTravelRequest);

router
  .route('/requests/:id')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getTravelRequest)
  .put(authorize('Employee', 'HR Administrator', 'Tenant Admin', 'Super Admin'), updateTravelRequest)
  .delete(authorize('Employee', 'HR Administrator', 'Tenant Admin', 'Super Admin'), deleteTravelRequest);

router
  .route('/requests/:id/submit')
  .post(authorize('Employee', 'HR Administrator', 'Tenant Admin', 'Super Admin'), submitTravelRequest);

router
  .route('/requests/:id/approve')
  .post(authorize('Manager', 'HR Administrator', 'Tenant Admin', 'Super Admin'), approveTravelRequest);

// Travel Advance Routes
router
  .route('/advances')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Finance Administrator', 'Tenant Admin', 'Super Admin'), getTravelAdvances)
  .post(authorize('Employee', 'HR Administrator', 'Tenant Admin', 'Super Admin'), createTravelAdvance);

router
  .route('/advances/:id/approve')
  .post(authorize('Manager', 'Finance Administrator', 'HR Administrator', 'Tenant Admin', 'Super Admin'), approveTravelAdvance);

router
  .route('/advances/:id/reject')
  .post(authorize('Manager', 'Finance Administrator', 'HR Administrator', 'Tenant Admin', 'Super Admin'), rejectTravelAdvance);

router
  .route('/advances/:id/pay')
  .post(authorize('Finance Administrator', 'Payroll Administrator', 'HR Administrator', 'Tenant Admin', 'Super Admin'), markTravelAdvancePaid);

// Travel Claim Routes
router
  .route('/claims')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Finance Administrator', 'Tenant Admin', 'Super Admin'), getTravelClaims)
  .post(authorize('Employee', 'HR Administrator', 'Tenant Admin', 'Super Admin'), createTravelClaim);

router
  .route('/claims/:id/submit')
  .post(authorize('Employee', 'HR Administrator', 'Tenant Admin', 'Super Admin'), submitTravelClaim);

router
  .route('/claims/:id/approve')
  .post(authorize('Manager', 'Finance Administrator', 'HR Administrator', 'Tenant Admin', 'Super Admin'), approveTravelClaim);

router
  .route('/claims/:id/reject')
  .post(authorize('Manager', 'Finance Administrator', 'HR Administrator', 'Tenant Admin', 'Super Admin'), rejectTravelClaim);

router
  .route('/claims/:id/settle')
  .post(authorize('Finance Administrator', 'Payroll Administrator', 'HR Administrator', 'Tenant Admin', 'Super Admin'), settleTravelClaim);

// Travel Policy Routes
router
  .route('/policies')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getTravelPolicies)
  .post(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), createTravelPolicy);

router
  .route('/policies/:id')
  .put(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), updateTravelPolicy)
  .delete(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), deleteTravelPolicy);

// LTA Routes
router
  .route('/lta')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getLTAs)
  .post(authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), createLTA);

router
  .route('/lta/balance/:employeeId')
  .get(authorize('HR Administrator', 'Manager', 'Employee', 'Tenant Admin', 'Super Admin'), getLTABalance);

router
  .route('/lta/:id/journey')
  .post(authorize('Employee', 'HR Administrator', 'Tenant Admin', 'Super Admin'), addLTAJourney);

router
  .route('/lta/:id/journey/approve')
  .post(authorize('Manager', 'HR Administrator', 'Tenant Admin', 'Super Admin'), approveLTAJourney);

module.exports = router;
