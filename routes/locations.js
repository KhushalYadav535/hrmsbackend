const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getLocations,
  getActiveLocations,
  getLocation,
  createLocation,
  updateLocation,
  deleteLocation,
} = require('../controllers/locationController');

// All routes require authentication
router.use(protect);

// GET /api/locations/active — Active locations for dropdown (all authenticated users)
router.get('/active', getActiveLocations);

// GET /api/locations — All locations
router.get('/', getLocations);

// GET /api/locations/:id — Single location
router.get('/:id', getLocation);

// POST /api/locations — Create location (HR Admin, Tenant Admin)
router.post('/', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), createLocation);

// PUT /api/locations/:id — Update location
router.put('/:id', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), updateLocation);

// DELETE /api/locations/:id — Archive location
router.delete('/:id', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), deleteLocation);

module.exports = router;
