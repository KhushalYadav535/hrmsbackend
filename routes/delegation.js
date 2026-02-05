const express = require('express');
const router = express.Router();
const {
  createDelegation,
  getDelegations,
  getDelegation,
  approveDelegation,
  revokeDelegation,
  updateDelegation,
} = require('../controllers/delegationController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication and tenant context
router.use(protect);
router.use(setTenant);

// Create delegation (BR-UAM-004)
router.post(
  '/',
  authorize('Employee', 'Manager', 'Tenant Admin', 'HR Administrator'),
  createDelegation
);

// Get all delegations
router.get(
  '/',
  authorize('Employee', 'Manager', 'Tenant Admin', 'HR Administrator'),
  getDelegations
);

// Get single delegation
router.get(
  '/:id',
  authorize('Employee', 'Manager', 'Tenant Admin', 'HR Administrator'),
  getDelegation
);

// Update delegation
router.put(
  '/:id',
  authorize('Employee', 'Manager', 'Tenant Admin', 'HR Administrator'),
  updateDelegation
);

// Approve delegation (BR-UAM-004)
router.post(
  '/:id/approve',
  authorize('Manager', 'Tenant Admin', 'HR Administrator'),
  approveDelegation
);

// Revoke delegation (BR-UAM-004)
router.post(
  '/:id/revoke',
  authorize('Employee', 'Manager', 'Tenant Admin', 'HR Administrator'),
  revokeDelegation
);

module.exports = router;
