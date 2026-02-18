const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Allow null for failed login attempts when user doesn't exist
    index: true,
  },
  userName: {
    type: String,
    required: true,
  },
  userEmail: {
    type: String,
  },
  action: {
    type: String,
    required: true,
    enum: ['Create', 'Update', 'Delete', 'Approve', 'Reject', 'Login', 'Login Failed', 'Login Success', 'Account Locked', 'Logout', 'View', 'Export', 'Import', 'Configure', 'Notification Sent', 'Submit', 'Process'],
  },
  module: {
    type: String,
    required: true,
  },
  entityType: {
    type: String,
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  details: {
    type: String,
    required: true,
  },
  changes: {
    type: String,
  },
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  status: {
    type: String,
    enum: ['Success', 'Failed', 'Warning'],
    default: 'Success',
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Compound indexes for efficient queries
auditLogSchema.index({ tenantId: 1, timestamp: -1 });
auditLogSchema.index({ tenantId: 1, module: 1, timestamp: -1 });
auditLogSchema.index({ tenantId: 1, action: 1, timestamp: -1 });
auditLogSchema.index({ tenantId: 1, userId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
