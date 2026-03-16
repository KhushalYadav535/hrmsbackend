const mongoose = require('mongoose');

/**
 * Employee Transfer Model
 * Tracks employee transfers across organization units (HO/ZO/RO/Branch)
 * BR-ORG-02: Transfer is a history event with effective date
 */
const employeeTransferSchema = new mongoose.Schema({
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
  fromUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrganizationUnit',
    required: true,
    comment: 'Source organization unit',
  },
  toUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrganizationUnit',
    required: true,
    comment: 'Destination organization unit',
  },
  transferType: {
    type: String,
    enum: ['Permanent', 'Temporary', 'Deputation'],
    default: 'Permanent',
    comment: 'Type of transfer',
  },
  effectiveDate: {
    type: Date,
    required: true,
    index: true,
    comment: 'BR-ORG-02: Effective date of transfer',
  },
  reason: {
    type: String,
    trim: true,
    comment: 'Reason for transfer',
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  // Temporary posting fields
  isTemporary: {
    type: Boolean,
    default: false,
    comment: 'BR-ORG-03: Temporary posting flag',
  },
  temporaryEndDate: {
    type: Date,
    comment: 'End date for temporary posting',
  },
  // Approval workflow
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Completed'],
    default: 'Pending',
    index: true,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
  rejectionReason: {
    type: String,
    trim: true,
  },
  // Audit fields
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  initiatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Indexes
employeeTransferSchema.index({ tenantId: 1, employeeId: 1, effectiveDate: -1 });
employeeTransferSchema.index({ tenantId: 1, fromUnitId: 1 });
employeeTransferSchema.index({ tenantId: 1, toUnitId: 1 });
employeeTransferSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('EmployeeTransfer', employeeTransferSchema);
