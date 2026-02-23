const express = require('express');
const router = express.Router();
const {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  approveExpense,
  deleteExpense,
} = require('../controllers/expenseController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('TRAVEL')); // BRD: DM-037 - Module access protection

router
  .route('/')
  .get(getExpenses)
  .post(createExpense);

router
  .route('/:id')
  .get(getExpense)
  .put(updateExpense)
  .delete(deleteExpense);

router
  .route('/:id/approve')
  .put(authorize('Manager', 'HR Administrator', 'Finance Administrator', 'Tenant Admin'), approveExpense);

module.exports = router;
