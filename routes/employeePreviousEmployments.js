const express = require('express');
const router = express.Router();
const {
  getEmployeePreviousEmployments,
  createPreviousEmployment,
  updatePreviousEmployment,
  deletePreviousEmployment,
} = require('../controllers/employeePreviousEmploymentController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication
router.use(protect);
router.use(setTenant);

// Routes for employee previous employments
router
  .route('/employees/:employeeId/previous-employments')
  .get(getEmployeePreviousEmployments)
  .post(authorize('HR Administrator', 'Tenant Admin'), createPreviousEmployment);

router
  .route('/employees/:employeeId/previous-employments/:id')
  .put(authorize('HR Administrator', 'Tenant Admin'), updatePreviousEmployment)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deletePreviousEmployment);

module.exports = router;
