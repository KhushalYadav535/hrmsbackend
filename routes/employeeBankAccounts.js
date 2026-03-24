const express = require('express');
const router = express.Router();
const {
  getEmployeeBankAccounts,
  getBankAccount,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
} = require('../controllers/employeeBankAccountController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication
router.use(protect);
router.use(setTenant);

// Routes for employee bank accounts
router
  .route('/employees/:employeeId/bank-accounts')
  .get(getEmployeeBankAccounts)
  .post(authorize('HR Administrator', 'Tenant Admin', 'Employee', 'Manager'), createBankAccount);

router
  .route('/employees/:employeeId/bank-accounts/:id')
  .get(getBankAccount)
  .put(authorize('HR Administrator', 'Tenant Admin', 'Employee', 'Manager'), updateBankAccount)
  .delete(authorize('HR Administrator', 'Tenant Admin', 'Employee', 'Manager'), deleteBankAccount);

module.exports = router;
