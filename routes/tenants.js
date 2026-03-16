const express = require('express');
const router = express.Router();
const {
  getTenants,
  getTenant,
  createTenant,
  updateTenant,
  getCurrentTenant,
  updateTenantSettings,
  approveTenant,
  rejectTenant,
  suspendTenant,
  deactivateTenant,
  reactivateTenant,
} = require('../controllers/tenantController');
const { protect, superAdminOnly, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);

router.route('/')
  .get(superAdminOnly, getTenants)
  .post(superAdminOnly, createTenant);

// Current tenant routes (requires tenant context)
router.get('/current', setTenant, authorize('Tenant Admin'), getCurrentTenant);
router.put('/current/settings', setTenant, authorize('Tenant Admin'), updateTenantSettings);

router
  .route('/:id')
  .get(authorize('Super Admin', 'Tenant Admin'), getTenant)
  .put(authorize('Super Admin', 'Tenant Admin'), updateTenant);

// US-A2-02: Platform Admin approval workflow
router.post('/:id/approve', superAdminOnly, approveTenant);
router.post('/:id/reject', superAdminOnly, rejectTenant);

// US-A4-01: Suspend/Deactivate tenant
router.post('/:id/suspend', superAdminOnly, suspendTenant);
router.post('/:id/deactivate', superAdminOnly, deactivateTenant);
router.post('/:id/reactivate', superAdminOnly, reactivateTenant);

module.exports = router;
