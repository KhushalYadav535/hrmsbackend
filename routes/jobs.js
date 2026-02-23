const express = require('express');
const router = express.Router();
const {
  getJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
} = require('../controllers/jobController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('RECRUITMENT')); // BRD: DM-037 - Module access protection

router
  .route('/')
  .get(getJobs)
  .post(authorize('HR Administrator', 'Tenant Admin'), createJob);

router
  .route('/:id')
  .get(getJob)
  .put(authorize('HR Administrator', 'Tenant Admin'), updateJob)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deleteJob);

module.exports = router;
