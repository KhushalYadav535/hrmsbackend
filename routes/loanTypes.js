const express = require('express');
const router = express.Router();
const LoanType = require('../models/LoanType');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

router.use(protect);
router.use(setTenant);

// @desc    Get all loan types
// @route   GET /api/loan-types
// @access  Private
router.get('/', asyncHandler(async (req, res) => {
  const { isActive } = req.query;
  const filter = { tenantId: req.tenantId };
  
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }
  
  const loanTypes = await LoanType.find(filter).sort({ loanName: 1 });
  
  res.status(200).json({
    success: true,
    count: loanTypes.length,
    data: loanTypes,
  });
}));

// @desc    Get single loan type
// @route   GET /api/loan-types/:id
// @access  Private
router.get('/:id', asyncHandler(async (req, res) => {
  const loanType = await LoanType.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  
  if (!loanType) {
    return res.status(404).json({
      success: false,
      message: 'Loan type not found',
    });
  }
  
  res.status(200).json({
    success: true,
    data: loanType,
  });
}));

module.exports = router;
