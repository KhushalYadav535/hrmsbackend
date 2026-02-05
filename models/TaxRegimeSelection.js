const mongoose = require('mongoose');

/**
 * Tax Regime Selection Model
 * BRD Requirement: BR-TAX-001, BR-TAX-004, BR-TAX-005
 * Track employee tax regime selection (once per FY)
 */
const taxRegimeSelectionSchema = new mongoose.Schema({
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
  regime: {
    type: String,
    enum: ['Old', 'New'],
    required: true,
  },
  selectedDate: {
    type: Date,
    default: Date.now,
  },
  changedDate: Date, // If regime changed during FY
  changeCount: {
    type: Number,
    default: 0,
  },
  // Recommendation data
  recommendedRegime: {
    type: String,
    enum: ['Old', 'New'],
  },
  oldRegimeTax: Number,
  newRegimeTax: Number,
  taxSavings: Number,
  recommendationReason: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

taxRegimeSelectionSchema.index({ tenantId: 1, employeeId: 1, financialYear: 1 }, { unique: true });
taxRegimeSelectionSchema.index({ tenantId: 1, financialYear: 1, regime: 1 });

taxRegimeSelectionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (this.isModified('regime') && this.regime !== this.get('regime')) {
    this.changedDate = Date.now();
    this.changeCount += 1;
  }
  next();
});

module.exports = mongoose.model('TaxRegimeSelection', taxRegimeSelectionSchema);
