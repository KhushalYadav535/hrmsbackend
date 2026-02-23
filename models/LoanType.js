const mongoose = require('mongoose');

/**
 * LoanType Model - Master Data
 * BRD Requirement: BR-P0-004 - Staff Loans & Advances Module
 * Defines available loan types with eligibility criteria and terms
 */
const loanTypeSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  loanCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    unique: true,
    index: true,
    comment: 'Unique code for loan type (e.g., FESTIVAL_ADV, HOUSE_BUILDING)',
  },
  loanName: {
    type: String,
    required: true,
    trim: true,
    comment: 'Display name (e.g., Festival Advance, House Building Loan)',
  },
  maxAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Maximum loan amount in INR',
  },
  interestRatePercent: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    comment: 'Annual interest rate percentage (0 for interest-free loans)',
  },
  maxTenureMonths: {
    type: Number,
    required: true,
    min: 1,
    comment: 'Maximum tenure in months',
  },
  minServiceYears: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
    comment: 'Minimum years of service required for eligibility',
  },
  eligibleGrades: {
    type: [String],
    default: [],
    comment: 'Array of eligible employee grades/designations (empty = all eligible)',
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
    comment: 'Whether this loan type is currently available',
  },
  description: {
    type: String,
    trim: true,
    comment: 'Description of loan type and terms',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound indexes
loanTypeSchema.index({ tenantId: 1, loanCode: 1 }, { unique: true });
loanTypeSchema.index({ tenantId: 1, isActive: 1 });

// Pre-save hook to update timestamp
loanTypeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('LoanType', loanTypeSchema);
