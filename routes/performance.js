const express = require('express');
const router = express.Router();
const {
  getPerformances,
  getPerformance,
  createPerformance,
  updatePerformance,
  deletePerformance,
} = require('../controllers/performanceController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

router
  .route('/')
  .get(getPerformances)
  .post(authorize('Manager', 'HR Administrator', 'Tenant Admin'), createPerformance);

router
  .route('/:id')
  .get(getPerformance)
  .put(authorize('Manager', 'HR Administrator', 'Tenant Admin'), updatePerformance)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deletePerformance);

module.exports = router;
