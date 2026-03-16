const express = require('express');
const router = express.Router();
const {
  getPositions,
  getPosition,
  createPosition,
  fillPosition,
  vacatePosition,
  getVacantPositionsByBranch,
  getBranchPositionSummary,
} = require('../controllers/positionController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication and tenant context
router.use(protect);
router.use(setTenant);

// Get all positions
router.get('/', getPositions);

// Get branch-wise summaries
router.get('/vacant/by-branch', getVacantPositionsByBranch);
router.get('/summary/by-branch', getBranchPositionSummary);

// Get single position
router.get('/:id', getPosition);

// Create position (HR Admin, Tenant Admin)
router.post('/', authorize('Tenant Admin', 'HR Administrator'), createPosition);

// Fill position
router.post('/:id/fill', authorize('Tenant Admin', 'HR Administrator'), fillPosition);

// Vacate position
router.post('/:id/vacate', authorize('Tenant Admin', 'HR Administrator'), vacatePosition);

module.exports = router;
