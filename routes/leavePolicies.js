const express = require('express');
const router = express.Router();
const {
  getLeavePolicies,
  getLeavePolicy,
  createLeavePolicy,
  updateLeavePolicy,
  deleteLeavePolicy,
} = require('../controllers/leavePolicyController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

router
  .route('/')
  .get(getLeavePolicies)
  .post(authorize('Tenant Admin', 'HR Administrator'), createLeavePolicy);

router
  .route('/:id')
  .get(getLeavePolicy)
  .put(authorize('Tenant Admin', 'HR Administrator'), updateLeavePolicy)
  .delete(authorize('Tenant Admin', 'HR Administrator'), deleteLeavePolicy);

module.exports = router;
