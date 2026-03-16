const express = require('express');
const router = express.Router();
const {
  createTransfer,
  approveTransfer,
  rejectTransfer,
  getTransfers,
  getTransfer,
  getEmployeeTransferHistory,
} = require('../controllers/employeeTransferController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication and tenant context
router.use(protect);
router.use(setTenant);

// Create transfer request
router.post('/', authorize('Tenant Admin', 'HR Administrator'), createTransfer);

// Approve transfer
router.post('/:id/approve', authorize('Tenant Admin', 'HR Administrator'), approveTransfer);

// Reject transfer
router.post('/:id/reject', authorize('Tenant Admin', 'HR Administrator'), rejectTransfer);

// Get all transfers
router.get('/', getTransfers);

// Get single transfer
router.get('/:id', getTransfer);

// Get employee transfer history
router.get('/employee/:employeeId', getEmployeeTransferHistory);

module.exports = router;
