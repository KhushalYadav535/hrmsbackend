const express = require('express');
const router = express.Router();
const {
  createRequest,
  getRequests,
  getRequest,
  reviewRequest,
} = require('../controllers/profileUpdateRequestController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

router.post('/', authorize('Employee', 'Manager'), createRequest);
router.get('/', getRequests);
router.get('/:id', getRequest);
router.patch('/:id/review', authorize('Manager', 'HR Administrator', 'Tenant Admin', 'Super Admin'), reviewRequest);

module.exports = router;
