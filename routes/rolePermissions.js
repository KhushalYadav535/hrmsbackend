const express = require('express');
const router = express.Router();
const {
  getRolePermissions,
  getRolePermission,
  updateRolePermissions,
  getAvailablePermissions,
} = require('../controllers/rolePermissionController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication and tenant context
router.use(protect);
router.use(setTenant);

// Get all role permissions
router.get(
  '/',
  authorize('Tenant Admin', 'HR Administrator', 'System Administrator'),
  getRolePermissions
);

// Get available permissions list
router.get('/available/list', getAvailablePermissions);

// Get single role permission
router.get('/:role', getRolePermission);

// Update role permissions (Tenant Admin only)
router.put(
  '/:role',
  authorize('Tenant Admin'),
  updateRolePermissions
);

module.exports = router;
