const express = require('express');
const router = express.Router();
const {
  getBonuses,
  getBonus,
  createBonus,
  updateBonus,
  processBonus,
  deleteBonus,
} = require('../controllers/bonusController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

router
  .route('/')
  .get(getBonuses)
  .post(authorize('Payroll Administrator', 'HR Administrator', 'Tenant Admin'), createBonus);

router
  .route('/:id')
  .get(getBonus)
  .put(authorize('Payroll Administrator', 'HR Administrator', 'Tenant Admin'), updateBonus)
  .delete(authorize('Payroll Administrator', 'HR Administrator', 'Tenant Admin'), deleteBonus);

router
  .route('/:id/process')
  .put(authorize('Payroll Administrator'), processBonus);

module.exports = router;
