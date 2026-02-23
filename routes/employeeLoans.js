const express = require('express');
const router = express.Router();
const {
  applyForLoan,
  getMyLoans,
  getApprovalQueue,
  approveLoan,
  disburseLoan,
  getLoanSchedule,
  getAllLoans,
  getLoanDetails,
} = require('../controllers/employeeLoanController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

// Apply authentication and tenant middleware to all routes
router.use(protect);
router.use(setTenant);
router.use(requireModule('STAFF_LOANS')); // BRD: DM-037 - Module access protection

// Employee routes
router.post('/apply', authorize('Employee'), applyForLoan);
router.get('/my-loans', authorize('Employee'), getMyLoans);
router.get('/:id/schedule', getLoanSchedule); // Employee can see own, admins can see all

// Approval routes
router.get('/approve-queue', authorize('Manager', 'HR Administrator', 'Finance Administrator', 'Tenant Admin', 'Super Admin'), getApprovalQueue);
router.patch('/:id/approve', authorize('Manager', 'HR Administrator', 'Finance Administrator', 'Tenant Admin', 'Super Admin'), approveLoan);

// Admin routes
router.get('/admin', authorize('HR Administrator', 'Finance Administrator', 'Tenant Admin', 'Super Admin'), getAllLoans);
router.get('/:id', getLoanDetails); // Employee can see own, admins can see all

// Finance routes
router.patch('/:id/disburse', authorize('Finance Administrator', 'Tenant Admin', 'Super Admin'), disburseLoan);

module.exports = router;
