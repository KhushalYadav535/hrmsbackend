const express = require('express');
const router = express.Router();
const {
  getEmployeeNominees,
  createNominee,
  updateNominee,
  deleteNominee,
} = require('../controllers/employeeNomineeController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication
router.use(protect);
router.use(setTenant);

// Routes for employee nominees
router
  .route('/employees/:employeeId/nominees')
  .get(getEmployeeNominees)
  .post(authorize('HR Administrator', 'Tenant Admin'), createNominee);

router
  .route('/employees/:employeeId/nominees/:id')
  .put(authorize('HR Administrator', 'Tenant Admin'), updateNominee)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deleteNominee);

module.exports = router;
