const express = require('express');
const router = express.Router();
const {
  submitTransferRequest,
  getTransferRequests,
  currentManagerApproval,
  destinationManagerApproval,
  hrVerification,
  generateTransferOrder,
  markRelieved,
  markJoined,
} = require('../controllers/transferController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('PIS')); // BRD: DM-037 - Transfer is part of Personnel

router.post('/', authorize('Employee', 'HR Administrator', 'Tenant Admin'), submitTransferRequest);
router.get('/', getTransferRequests);
router.patch('/:id/current-manager-approval', authorize('Manager', 'HR Administrator', 'Tenant Admin'), currentManagerApproval);
router.patch('/:id/destination-manager-approval', authorize('Manager', 'HR Administrator', 'Tenant Admin'), destinationManagerApproval);
router.patch('/:id/hr-verification', authorize('HR Administrator', 'Tenant Admin'), hrVerification);
router.post('/:id/generate-order', authorize('HR Administrator', 'Tenant Admin'), generateTransferOrder);
router.patch('/:id/relieve', authorize('HR Administrator', 'Tenant Admin'), markRelieved);
router.patch('/:id/join', authorize('HR Administrator', 'Tenant Admin'), markJoined);

module.exports = router;
