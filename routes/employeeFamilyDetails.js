const express = require('express');
const router = express.Router();
const {
  getEmployeeFamilyDetails,
  upsertFamilyDetails,
  deleteFamilyDetails,
} = require('../controllers/employeeFamilyDetailController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication
router.use(protect);
router.use(setTenant);

// Routes for employee family details
router
  .route('/employees/:employeeId/family-details')
  .get(getEmployeeFamilyDetails)
  .post(authorize('HR Administrator', 'Tenant Admin'), upsertFamilyDetails)
  .put(authorize('HR Administrator', 'Tenant Admin'), upsertFamilyDetails)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deleteFamilyDetails);

module.exports = router;
