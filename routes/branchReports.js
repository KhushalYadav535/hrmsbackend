const express = require('express');
const router = express.Router();
const {
  getBranchReport,
  compareBranches,
  getAllBranchesSummary,
} = require('../controllers/branchReportController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication and tenant context
router.use(protect);
router.use(setTenant);

// IMPORTANT: Specific routes must come before parameterized routes
// Compare multiple branches
router.get('/compare', compareBranches);

// Get all branches summary
router.get('/summary/all', getAllBranchesSummary);

// Get comprehensive branch report (must be last due to :branchId parameter)
router.get('/:branchId', getBranchReport);

module.exports = router;
