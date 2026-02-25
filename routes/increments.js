const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const incrementController = require('../controllers/incrementController');

// Policy management
router.get('/policy', protect, incrementController.getIncrementPolicy);
router.post('/policy', protect, authorize('Tenant Admin', 'HR Administrator'), incrementController.upsertIncrementPolicy);
router.post('/policy/seed-defaults', protect, authorize('Tenant Admin'), incrementController.seedDefaultPolicy);

// Records
router.get('/', protect, incrementController.getIncrementRecords);
router.post('/compute', protect, authorize('Tenant Admin', 'HR Administrator'), incrementController.computeIncrements);
router.post('/bulk-approve', protect, authorize('Tenant Admin'), incrementController.bulkApproveIncrements);
router.put('/:id/approve', protect, authorize('Tenant Admin', 'HR Administrator'), incrementController.approveIncrement);
router.put('/:id/reject', protect, authorize('Tenant Admin', 'HR Administrator'), incrementController.rejectIncrement);
router.post('/:id/apply', protect, authorize('Tenant Admin', 'HR Administrator', 'Payroll Administrator'), incrementController.applyIncrementToEmployee);

module.exports = router;
