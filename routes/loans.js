const express = require('express');
const router = express.Router();
const {
  getLoans,
  createLoan,
  updateLoan,
} = require('../controllers/loanController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

router
  .route('/')
  .get(getLoans)
  .post(authorize('HR Administrator', 'Finance Administrator', 'Super Admin'), createLoan);

router
  .route('/:id')
  .put(authorize('HR Administrator', 'Finance Administrator', 'Super Admin'), updateLoan);

module.exports = router;
