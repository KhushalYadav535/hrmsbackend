const express = require('express');
const router = express.Router();
const {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  deactivateUser,
  activateUser,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication and tenant context
router.use(protect);
router.use(setTenant);

// Create user (BR-UAM-001)
router.post(
  '/',
  authorize('Tenant Admin', 'HR Administrator'),
  createUser
);

// Get all users
router.get(
  '/',
  authorize('Tenant Admin', 'HR Administrator', 'System Administrator'),
  getUsers
);

// Get single user
router.get('/:id', getUser);

// Update user
router.put(
  '/:id',
  authorize('Tenant Admin', 'HR Administrator'),
  updateUser
);

// Delete user
router.delete(
  '/:id',
  authorize('Tenant Admin'),
  deleteUser
);

// Reset user password (BR-UAM-001)
router.post(
  '/:id/reset-password',
  authorize('Tenant Admin', 'HR Administrator'),
  resetUserPassword
);

// Deactivate user (BR-UAM-001)
router.post(
  '/:id/deactivate',
  authorize('Tenant Admin', 'HR Administrator'),
  deactivateUser
);

// Activate user (BR-UAM-001)
router.post(
  '/:id/activate',
  authorize('Tenant Admin', 'HR Administrator'),
  activateUser
);

module.exports = router;
