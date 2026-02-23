const express = require('express');
const router = express.Router();
const {
  getEmployeeEmergencyContacts,
  createEmergencyContact,
  updateEmergencyContact,
  deleteEmergencyContact,
} = require('../controllers/employeeEmergencyContactController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication
router.use(protect);
router.use(setTenant);

// Routes for employee emergency contacts
router
  .route('/employees/:employeeId/emergency-contacts')
  .get(getEmployeeEmergencyContacts)
  .post(authorize('HR Administrator', 'Tenant Admin'), createEmergencyContact);

router
  .route('/employees/:employeeId/emergency-contacts/:id')
  .put(authorize('HR Administrator', 'Tenant Admin'), updateEmergencyContact)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deleteEmergencyContact);

module.exports = router;
