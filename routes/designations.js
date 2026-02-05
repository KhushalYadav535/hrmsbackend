const express = require('express');
const router = express.Router();
const {
  getDesignations,
  getDesignation,
  createDesignation,
  updateDesignation,
  deleteDesignation,
} = require('../controllers/designationController');
const { protect } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { authorize } = require('../middleware/auth');

// All routes require authentication and tenant context
router.use(protect);
router.use(setTenant);

// Get all designations
router.get('/', getDesignations);

// Get single designation
router.get('/:id', getDesignation);

// Create designation
router.post(
  '/',
  authorize('Tenant Admin', 'HR Administrator'),
  createDesignation
);

// Update designation
router.put(
  '/:id',
  authorize('Tenant Admin', 'HR Administrator'),
  updateDesignation
);

// Delete designation
router.delete(
  '/:id',
  authorize('Tenant Admin', 'HR Administrator'),
  deleteDesignation
);

module.exports = router;
