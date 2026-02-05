const express = require('express');
const router = express.Router();
const {
  getLDAPConfig,
  updateLDAPConfig,
  testLDAPConnection,
  syncLDAPUsers,
  getLDAPUsers,
  mapLDAPRole,
  getLDAPRoleMappings,
  deleteLDAPRoleMapping,
} = require('../controllers/ldapController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication and tenant context (except SSO login which is handled in auth routes)
router.use(protect);
router.use(setTenant);

// Get LDAP configuration
router.get(
  '/config',
  authorize('Tenant Admin', 'Super Admin'),
  getLDAPConfig
);

// Update LDAP configuration
router.put(
  '/config',
  authorize('Tenant Admin', 'Super Admin'),
  updateLDAPConfig
);

// Test LDAP connection
router.post(
  '/test',
  authorize('Tenant Admin', 'Super Admin'),
  testLDAPConnection
);

// Sync users from LDAP
router.post(
  '/sync',
  authorize('Tenant Admin', 'Super Admin'),
  syncLDAPUsers
);

// Get LDAP users
router.get(
  '/users',
  authorize('Tenant Admin', 'Super Admin'),
  getLDAPUsers
);

// Create role mapping
router.post(
  '/role-mapping',
  authorize('Tenant Admin', 'Super Admin'),
  mapLDAPRole
);

// Get role mappings
router.get(
  '/role-mapping',
  authorize('Tenant Admin', 'Super Admin'),
  getLDAPRoleMappings
);

// Delete role mapping
router.delete(
  '/role-mapping/:id',
  authorize('Tenant Admin', 'Super Admin'),
  deleteLDAPRoleMapping
);

module.exports = router;
