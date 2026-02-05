const express = require('express');
const router = express.Router();
const {
  getTenants,
  getTenant,
  updateTenant,
  getCurrentTenant,
  updateTenantSettings,
} = require('../controllers/tenantController');
const { protect, superAdminOnly, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);

router.get('/', superAdminOnly, getTenants);

// Current tenant routes (requires tenant context)
router.get('/current', setTenant, authorize('Tenant Admin'), getCurrentTenant);
router.put('/current/settings', setTenant, authorize('Tenant Admin'), updateTenantSettings);

router
  .route('/:id')
  .get(authorize('Super Admin', 'Tenant Admin'), getTenant)
  .put(authorize('Super Admin', 'Tenant Admin'), updateTenant);

module.exports = router;
