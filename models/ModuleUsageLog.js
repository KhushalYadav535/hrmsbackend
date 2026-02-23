const mongoose = require('mongoose');

/**
 * Module Usage Logs
 * Track module usage for analytics and billing
 * BRD: Dynamic Module Management System - DM-006
 */
const moduleUsageLogSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PlatformModule',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    // Which user accessed the module
  },
  action: {
    type: String,
    // CREATE, READ, UPDATE, DELETE, APPROVE, PROCESS, EXPORT
  },
  entityType: {
    type: String,
    // EMPLOYEE, PAYSLIP, LEAVE_APPLICATION, etc.
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    // ID of the entity accessed
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  durationSeconds: {
    type: Number,
    // Time spent in module
  },
  
  // For billing purposes
  isBillable: {
    type: Boolean,
    default: true,
  },
  
  // Metadata
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
}, {
  timestamps: true,
});

// Indexes for analytics queries
moduleUsageLogSchema.index({ tenantId: 1, moduleId: 1, timestamp: -1 });
moduleUsageLogSchema.index({ userId: 1, timestamp: -1 });
moduleUsageLogSchema.index({ timestamp: -1 }); // For time-based queries

module.exports = mongoose.model('ModuleUsageLog', moduleUsageLogSchema);
