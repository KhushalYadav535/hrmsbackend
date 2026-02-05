const mongoose = require('mongoose');

/**
 * Delegation Model
 * BRD Requirement: BR-UAM-004
 * Delegation of approval authority
 */
const delegationSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  delegatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  delegateeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // What is being delegated
  permissions: [{
    type: String,
    required: true,
  }],
  modules: [{
    type: String,
    enum: ['Leave', 'Travel', 'Expense', 'Appraisal', 'Payroll', 'All'],
  }],
  // Delegation period
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  // Reason for delegation
  reason: {
    type: String,
    required: true,
  },
  // Status
  status: {
    type: String,
    enum: ['Pending', 'Active', 'Expired', 'Revoked', 'Completed'],
    default: 'Pending',
  },
  // Approval (if required)
  requiresApproval: {
    type: Boolean,
    default: false,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedDate: Date,
  // Revocation
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  revokedDate: Date,
  revocationReason: String,
  // Notification sent
  notificationSent: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

delegationSchema.index({ tenantId: 1, delegatorId: 1 });
delegationSchema.index({ tenantId: 1, delegateeId: 1 });
delegationSchema.index({ tenantId: 1, status: 1 });
delegationSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });

delegationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Auto-update status based on dates
  const now = new Date();
  if (this.status === 'Active' && this.endDate < now) {
    this.status = 'Expired';
  } else if (this.status === 'Pending' && this.startDate <= now && this.endDate >= now) {
    if (!this.requiresApproval || this.approvedBy) {
      this.status = 'Active';
    }
  }
  
  next();
});

module.exports = mongoose.model('Delegation', delegationSchema);
