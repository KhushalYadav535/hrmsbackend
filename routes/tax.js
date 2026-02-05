const express = require('express');
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

// Tax Declarations
router
  .route('/declarations')
  .post(authorize('Employee'), createDeclaration)
  .get(authorize('Employee', 'HR Admin', 'Payroll Admin', 'Tenant Admin'), getDeclarations);

router
  .route('/declarations/:id')
  .get(authorize('Employee', 'HR Admin', 'Payroll Admin', 'Tenant Admin'), getDeclaration);

router
  .route('/declarations/:id/status')
  .put(authorize('HR Admin', 'Payroll Admin', 'Tenant Admin'), updateDeclarationStatus);

// Tax Computation
router
  .route('/computation')
  .get(authorize('Employee', 'HR Admin', 'Payroll Admin', 'Tenant Admin'), getTaxComputation);

router
  .route('/computation/calculate')
  .post(authorize('Payroll Admin', 'Tenant Admin'), calculateMonthlyTDS);

router
  .route('/computation/sheet')
  .get(authorize('Employee', 'HR Admin', 'Payroll Admin', 'Tenant Admin'), getTaxComputationSheet);

// Tax Calculator
router
  .route('/calculator/compare-regimes')
  .post(authorize('Employee', 'HR Admin', 'Payroll Admin', 'Tenant Admin'), compareRegimes);

router
  .route('/calculator/select-regime')
  .post(authorize('Employee'), selectRegime);

router
  .route('/calculator/recommended-regime')
  .get(authorize('Employee', 'HR Admin', 'Payroll Admin', 'Tenant Admin'), getRecommendedRegime);

router
  .route('/calculator/hra')
  .post(authorize('Employee', 'HR Admin', 'Payroll Admin', 'Tenant Admin'), calculateHRA);

// Form 16
router
  .route('/form16')
  .get(authorize('Employee', 'HR Admin', 'Payroll Admin', 'Tenant Admin'), getForm16)
  .post(authorize('Payroll Admin', 'Tenant Admin'), generateForm16);

// HRA Declaration
router
  .route('/hra')
  .get(authorize('Employee', 'HR Admin', 'Payroll Admin', 'Tenant Admin'), getHRADeclaration)
  .post(authorize('Employee'), createHRADeclaration);

router
  .route('/hra/:id/verify')
  .put(authorize('HR Admin', 'Payroll Admin', 'Tenant Admin'), verifyHRADeclaration);

// Form 24Q (TRACES)
router
  .route('/form24q')
  .get(authorize('Payroll Admin', 'HR Admin', 'Tenant Admin'), getForm24Qs)
  .post(authorize('Payroll Admin', 'Tenant Admin'), generateForm24Q);

router
  .route('/form24q/:form24QId')
  .get(authorize('Payroll Admin', 'HR Admin', 'Tenant Admin'), getForm24Q);

router
  .route('/form24q/:form24QId/validate')
  .post(authorize('Payroll Admin', 'Tenant Admin'), validateForm24Q);

router
  .route('/form24q/:form24QId/upload')
  .post(authorize('Payroll Admin', 'Tenant Admin'), uploadForm24Q);

router
  .route('/form24q/:form24QId/traces-status')
  .get(authorize('Payroll Admin', 'HR Admin', 'Tenant Admin'), checkTRACESStatus);

router
  .route('/form24q/form16-part-a')
  .get(authorize('Payroll Admin', 'HR Admin', 'Tenant Admin', 'Employee'), downloadForm16PartA);

module.exports = router;
