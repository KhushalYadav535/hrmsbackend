const express = require('express');
const { requireModule } = require('../middleware/modulePermission');
const {
  createDeclaration,
  getDeclarations,
  getDeclaration,
  updateDeclarationStatus,
} = require('../controllers/taxController');
const {
  getTaxComputation,
  calculateMonthlyTDS,
  getTaxComputationSheet,
} = require('../controllers/taxComputationController');
const {
  compareRegimes,
  selectRegime,
  getRecommendedRegime,
  calculateHRA,
} = require('../controllers/taxCalculatorController');
const {
  generateForm16,
  getForm16,
} = require('../controllers/form16Controller');
const {
  createHRADeclaration,
  getHRADeclaration,
  verifyHRADeclaration,
} = require('../controllers/hraController');
const {
  generateForm24Q,
  getForm24Q,
  getForm24Qs,
  validateForm24Q,
  uploadForm24Q,
  downloadForm16PartA,
  checkTRACESStatus,
} = require('../controllers/form24QController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

const router = express.Router();

// All routes are protected and tenant-scoped
router.use(protect);
router.use(setTenant);
router.use(requireModule('TAX')); // BRD: DM-037 - Module access protection

// Tax Declarations
router
  .route('/declarations')
  .post(authorize('Employee'), createDeclaration)
  .get(authorize('Employee', 'HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Maker'), getDeclarations);

router
  .route('/declarations/:id')
  .get(authorize('Employee', 'HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Maker'), getDeclaration);

router
  .route('/declarations/:id/status')
  .put(authorize('HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Maker'), updateDeclarationStatus);

// Tax Computation
router
  .route('/computation')
  .get(authorize('Employee', 'HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Maker'), getTaxComputation);

router
  .route('/computation/calculate')
  .post(authorize('Payroll Administrator', 'Tenant Admin', 'Maker'), calculateMonthlyTDS);

router
  .route('/computation/sheet')
  .get(authorize('Employee', 'HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Maker'), getTaxComputationSheet);

// Tax Calculator
router
  .route('/calculator/compare-regimes')
  .post(authorize('Employee', 'HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Maker'), compareRegimes);

router
  .route('/calculator/select-regime')
  .post(authorize('Employee'), selectRegime);

router
  .route('/calculator/recommended-regime')
  .get(authorize('Employee', 'HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Maker'), getRecommendedRegime);

router
  .route('/calculator/hra')
  .post(authorize('Employee', 'HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Maker'), calculateHRA);

// Form 16
router
  .route('/form16')
  .get(authorize('Employee', 'HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Maker'), getForm16)
  .post(authorize('Payroll Administrator', 'Tenant Admin', 'Maker'), generateForm16);

// HRA Declaration
router
  .route('/hra')
  .get(authorize('Employee', 'HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Maker'), getHRADeclaration)
  .post(authorize('Employee'), createHRADeclaration);

router
  .route('/hra/:id/verify')
  .put(authorize('HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Maker'), verifyHRADeclaration);

// Form 24Q (TRACES)
router
  .route('/form24q')
  .get(authorize('Payroll Administrator', 'HR Administrator', 'Tenant Admin', 'Maker'), getForm24Qs)
  .post(authorize('Payroll Administrator', 'Tenant Admin', 'Maker'), generateForm24Q);

router
  .route('/form24q/:form24QId')
  .get(authorize('Payroll Administrator', 'HR Administrator', 'Tenant Admin', 'Maker'), getForm24Q);

router
  .route('/form24q/:form24QId/validate')
  .post(authorize('Payroll Administrator', 'Tenant Admin', 'Maker'), validateForm24Q);

router
  .route('/form24q/:form24QId/upload')
  .post(authorize('Payroll Administrator', 'Tenant Admin', 'Maker'), uploadForm24Q);

router
  .route('/form24q/:form24QId/traces-status')
  .get(authorize('Payroll Administrator', 'HR Administrator', 'Tenant Admin', 'Maker'), checkTRACESStatus);

router
  .route('/form24q/form16-part-a')
  .get(authorize('Payroll Administrator', 'HR Administrator', 'Tenant Admin', 'Employee', 'Maker'), downloadForm16PartA);

module.exports = router;
