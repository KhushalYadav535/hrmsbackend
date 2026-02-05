const express = require('express');
const router = express.Router();
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} = require('../controllers/employeeController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication
router.use(protect);
router.use(setTenant);

router
  .route('/')
  .get(getEmployees)
  .post(authorize('HR Administrator', 'Tenant Admin'), createEmployee);

router
  .route('/:id')
  .get(getEmployee)
  .put(authorize('HR Administrator', 'Tenant Admin'), updateEmployee)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deleteEmployee);

module.exports = router;
