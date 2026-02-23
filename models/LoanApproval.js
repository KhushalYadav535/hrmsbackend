const mongoose = require('mongoose');

/**
 * LoanApproval Model - Approval Chain Audit Trail
 * BRD Requirement: BR-P0-004 - Staff Loans & Advances Module
 * Tracks approval workflow: Manager → HR → Finance
 */
const loanApprovalSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmployeeLoan',
    required: true,
    index: true,
  },
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    comment: 'User who approved/rejected',
  },
  approverName: {
    type: String,
    required: true,
    comment: 'Name of approver (denormalized for audit)',
  },
  approverRole: {
    type: String,
    required: true,
    comment: 'Role of approver (denormalized for audit)',
  },
  approvalLevel: {
    type: Number,
    required: true,
    enum: [1, 2, 3],
    comment: '1 = Manager, 2 = HR, 3 = Finance',
  },
  action: {
    type: String,
    enum: ['APPROVED', 'REJECTED'],
    required: true,
    comment: 'Approval action taken',
  },
  remarks: {
    type: String,
    trim: true,
    comment: 'Approver remarks/comments',
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
    comment: 'When approval/rejection occurred',
  },
  // Additional metadata
  ipAddress: {
    type: String,
    comment: 'IP address of approver',
  },
  userAgent: {
    type: String,
    comment: 'User agent of approver',
  },
}, {
  timestamps: true,
});

// Compound indexes
loanApprovalSchema.index({ tenantId: 1, loanId: 1, approvalLevel: 1 });
loanApprovalSchema.index({ tenantId: 1, loanId: 1, timestamp: -1 }); // Chronological order
loanApprovalSchema.index({ tenantId: 1, approverId: 1, timestamp: -1 }); // Approver's history

module.exports = mongoose.model('LoanApproval', loanApprovalSchema);
