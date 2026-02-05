const mongoose = require('mongoose');

/**
 * Travel Advance Model
 * BRD Requirement: HRMS-TRV-005, BR-TRV-004
 * Travel advance request and approval (limited to 80% of estimated expense)
 */
const travelAdvanceSchema = new mongoose.Schema({
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
  travelRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TravelRequest',
    required: true,
    index: true,
  },
  estimatedAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Total estimated expense',
  },
  advanceAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Requested advance amount (max 80% of estimated)',
  },
  eligibleAdvance: {
    type: Number,
    default: 0,
    comment: 'Auto-calculated eligible advance (80% of estimated)',
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Paid', 'Settled', 'Recovered'],
    default: 'Pending',
  },
  // Approval workflow
  requestedDate: {
    type: Date,
    default: Date.now,
  },
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approverName: String,
  approvalComments: String,
  approvedDate: Date,
  // Finance approval (if advance > threshold, e.g., ₹50,000)
  requiresFinanceApproval: {
    type: Boolean,
    default: false,
  },
  financeApproverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  financeApprovedDate: Date,
  // Payment tracking
  paidDate: Date,
  paymentReference: String,
  paymentMethod: {
    type: String,
    enum: ['Salary', 'Direct Transfer', 'Petty Cash'],
  },
  // Settlement tracking
  settledAmount: {
    type: Number,
    default: 0,
    comment: 'Amount settled against final claim',
  },
  recoveryAmount: {
    type: Number,
    default: 0,
    comment: 'Amount to be recovered if advance > claim',
  },
  remarks: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

travelAdvanceSchema.index({ tenantId: 1, employeeId: 1 });
travelAdvanceSchema.index({ tenantId: 1, travelRequestId: 1 });
travelAdvanceSchema.index({ tenantId: 1, status: 1 });

travelAdvanceSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  // Auto-calculate eligible advance (80% of estimated)
  if (this.estimatedAmount && !this.eligibleAdvance) {
    this.eligibleAdvance = Math.round(this.estimatedAmount * 0.8);
  }
  next();
});

module.exports = mongoose.model('TravelAdvance', travelAdvanceSchema);
