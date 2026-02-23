const express = require('express');
const router = express.Router();
const {
  getHierarchy,
  getOrganizationUnits,
  getOrganizationUnit,
  getChildren,
  getUnitEmployees,
  createOrganizationUnit,
  updateOrganizationUnit,
  deleteOrganizationUnit,
} = require('../controllers/organizationUnitController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// Apply authentication and tenant middleware to all routes
router.use(protect);
router.use(setTenant);

// Hierarchy endpoint
router.get('/hierarchy', getHierarchy);

// CRUD routes
router
  .route('/units')
  .get(getOrganizationUnits)
  .post(authorize('Tenant Admin', 'Super Admin'), createOrganizationUnit);

router
  .route('/units/:id')
  .get(getOrganizationUnit)
  .patch(authorize('Tenant Admin', 'Super Admin'), updateOrganizationUnit)
  .delete(authorize('Tenant Admin', 'Super Admin'), deleteOrganizationUnit);

// Nested routes
router.get('/units/:id/children', getChildren);
router.get('/units/:id/employees', getUnitEmployees);

module.exports = router;
