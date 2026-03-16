const express = require('express');
const router = express.Router();
const {
  getHierarchy,
  getOrganizationUnits,
  getOrganizationUnit,
  getOrganizationUnitChildren,
  getUnitEmployees,
  createOrganizationUnit,
  updateOrganizationUnit,
  deleteOrganizationUnit,
  mergeUnits,
  seedSampleData,
  deleteSeedData,
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

// Seed sample data routes (must come before /units/:id to avoid route conflict)
router.post('/units/seed', authorize('Tenant Admin', 'Super Admin'), seedSampleData);
router.delete('/units/seed', authorize('Tenant Admin', 'Super Admin'), deleteSeedData);

router
  .route('/units/:id')
  .get(getOrganizationUnit)
  .patch(authorize('Tenant Admin', 'Super Admin'), updateOrganizationUnit)
  .delete(authorize('Tenant Admin', 'Super Admin'), deleteOrganizationUnit);

// Nested routes
router.get('/units/:id/children', getOrganizationUnitChildren);
router.get('/units/:id/employees', getUnitEmployees);

// Merge route
router.post('/units/:id/merge', authorize('Tenant Admin', 'Super Admin'), mergeUnits);

module.exports = router;
