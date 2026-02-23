const express = require('express');
const router = express.Router();
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} = require('../controllers/employeeController');
const {
  downloadTemplate,
  validateImport,
  importEmployees,
  exportEmployees,
  upload,
} = require('../controllers/bulkEmployeeController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

// All routes require authentication
router.use(protect);
router.use(setTenant);

// Bulk Import/Export Routes (BR-P0-006) - No module check for initial tenant setup
router.get('/bulk/template', authorize('HR Administrator', 'Tenant Admin'), downloadTemplate);
router.post('/bulk/validate', authorize('HR Administrator', 'Tenant Admin'), upload, validateImport);
router.post('/bulk/import', authorize('HR Administrator', 'Tenant Admin'), importEmployees);
router.post('/bulk/export', authorize('HR Administrator', 'Tenant Admin', 'Auditor'), exportEmployees);

// Regular employee routes - require PIS module (BRD: DM-037)
router.use(requireModule('PIS'));

router
  .route('/')
  .get(getEmployees)
  .post(authorize('HR Administrator', 'Tenant Admin'), createEmployee);

router
  .route('/:id')
  .get(getEmployee)
  .put(authorize('HR Administrator', 'Tenant Admin'), updateEmployee)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deleteEmployee);

module.exports = router;
