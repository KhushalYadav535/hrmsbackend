const mongoose = require('mongoose');

/**
 * Previous Employer Income Model
 * BRD Requirement: BR-TAX-005
 * Track previous employer income for accurate tax calculation
 */
const previousEmployerIncomeSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  financialYear: {
    type: String,
    required: true,
    index: true,
  },
  // Previous employer details
  previousEmployer: {
    name: String,
    pan: String,
    tan: String,
    address: String,
  },
  // Income details
  grossSalary: Number,
  tdsDeducted: Number,
  form16Url: String, // Uploaded Form 16 from previous employer
  // Period
  startDate: Date,
  endDate: Date,
  months: Number,
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Verified'],
    default: 'Draft',
  },
  submittedDate: Date,
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  verifiedDate: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

previousEmployerIncomeSchema.index({ tenantId: 1, employeeId: 1, financialYear: 1 });
previousEmployerIncomeSchema.index({ tenantId: 1, financialYear: 1 });

previousEmployerIncomeSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('PreviousEmployerIncome', previousEmployerIncomeSchema);
