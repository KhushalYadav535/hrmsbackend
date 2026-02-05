const express = require('express');
const router = express.Router();
const {
  getPayrolls,
  getPayroll,
  createPayroll,
  updatePayroll,
  deletePayroll,
  processPayroll,
  getPayrollStats,
  submitPayroll,
  approvePayroll,
  rejectPayroll,
  finalizePayroll,
} = require('../controllers/payrollController');
const {
  generateBankFile,
  generateECRFile,
  generateESICFile,
  uploadECRFile,
  downloadEPFOAcknowledgment,
  validateUAN,
  bulkValidateUANs,
  uploadESICFile,
  getESICPaymentStatus,
} = require('../controllers/payrollFileController');
const {
  validateAccount,
  getAccountDetails,
  confirmTransactionStatus,
  bulkConfirmTransactionStatus,
  getFailedTransactions,
  retryFailedTransaction,
  getTransactionHistory,
} = require('../controllers/cbsController');
const {
  generatePayslipPDF,
} = require('../controllers/payslipController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

router
  .route('/')
  .get(getPayrolls)
  .post(authorize('Payroll Administrator', 'HR Administrator', 'Tenant Admin'), createPayroll);

router
  .route('/stats')
  .get(getPayrollStats); // All authenticated users with view permission can see stats

router
  .route('/process')
  .post(authorize('Payroll Administrator', 'Super Admin'), processPayroll); // Only Payroll Admin can process

router
  .route('/:id')
  .get(getPayroll)
  .put(authorize('Payroll Administrator', 'HR Administrator', 'Tenant Admin'), updatePayroll)
  .delete(authorize('Payroll Administrator'), deletePayroll);

// Approval workflow routes
router
  .route('/:id/submit')
  .post(authorize('Payroll Administrator', 'Super Admin'), submitPayroll);

router
  .route('/:id/approve')
  .post(authorize('Payroll Administrator', 'Finance Administrator', 'Super Admin'), approvePayroll);

router
  .route('/:id/reject')
  .post(authorize('Payroll Administrator', 'Finance Administrator', 'Super Admin'), rejectPayroll);

router
  .route('/:id/finalize')
  .post(authorize('Payroll Administrator', 'Finance Administrator', 'Super Admin'), finalizePayroll);

// File generation routes
router
  .route('/bank-file/generate')
  .get(authorize('Payroll Administrator', 'Finance Administrator', 'Super Admin'), generateBankFile);

// EPFO routes
router
  .route('/ecr/generate')
  .get(authorize('Payroll Administrator', 'Super Admin'), generateECRFile);

router
  .route('/ecr/upload')
  .post(authorize('Payroll Administrator', 'Super Admin'), uploadECRFile);

router
  .route('/ecr/acknowledgment')
  .get(authorize('Payroll Administrator', 'Super Admin'), downloadEPFOAcknowledgment);

router
  .route('/ecr/validate-uan')
  .post(authorize('Payroll Administrator', 'Super Admin'), validateUAN);

router
  .route('/ecr/validate-uans')
  .post(authorize('Payroll Administrator', 'Super Admin'), bulkValidateUANs);

// ESIC routes
router
  .route('/esic/generate')
  .get(authorize('Payroll Administrator', 'Super Admin'), generateESICFile);

router
  .route('/esic/upload')
  .post(authorize('Payroll Administrator', 'Super Admin'), uploadESICFile);

router
  .route('/esic/payment-status')
  .get(authorize('Payroll Administrator', 'Super Admin'), getESICPaymentStatus);

router
  .route('/payslip/:id/pdf')
  .get(generatePayslipPDF);

// CBS (Core Banking System) routes
router
  .route('/cbs/validate-account')
  .post(authorize('Payroll Administrator', 'HR Administrator', 'Finance Administrator', 'Super Admin'), validateAccount);

router
  .route('/cbs/account-details')
  .get(authorize('Payroll Administrator', 'HR Administrator', 'Finance Administrator', 'Super Admin'), getAccountDetails);

router
  .route('/cbs/transaction-status')
  .post(authorize('Payroll Administrator', 'Finance Administrator', 'Super Admin'), confirmTransactionStatus);

router
  .route('/cbs/bulk-transaction-status')
  .post(authorize('Payroll Administrator', 'Finance Administrator', 'Super Admin'), bulkConfirmTransactionStatus);

router
  .route('/cbs/failed-transactions')
  .get(authorize('Payroll Administrator', 'Finance Administrator', 'Super Admin'), getFailedTransactions);

router
  .route('/cbs/transaction/:transactionId/retry')
  .post(authorize('Payroll Administrator', 'Finance Administrator', 'Super Admin'), retryFailedTransaction);

router
  .route('/cbs/transaction-history')
  .get(authorize('Payroll Administrator', 'Finance Administrator', 'Super Admin'), getTransactionHistory);

module.exports = router;
