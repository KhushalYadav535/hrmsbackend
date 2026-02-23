const mongoose = require('mongoose');

/**
 * Module Change History
 * Audit trail of all module activation/deactivation
 * BRD: Dynamic Module Management System - DM-007
 */
const moduleChangeHistorySchema = new mongoose.Schema({
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
  
  changeType: {
    type: String,
    required: true,
    enum: [
      'ACTIVATED',
      'DEACTIVATED',
      'CONFIG_CHANGED',
      'TRIAL_STARTED',
      'TRIAL_ENDED',
      'UPGRADED',
      'DOWNGRADED',
      'RENEWED',
      'SUSPENDED',
    ],
    index: true,
  },
  oldStatus: {
    type: String,
  },
  newStatus: {
    type: String,
  },
  oldConfig: {
    type: mongoose.Schema.Types.Mixed,
  },
  newConfig: {
    type: mongoose.Schema.Types.Mixed,
  },
  reason: {
    type: String,
  },
  changedBy: {
    type: String,
    required: true,
  },
  changedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  
  // Impact tracking
  affectedUsers: {
    type: Number,
    // Number of users affected
  },
  dataArchived: {
    type: Boolean,
    default: false,
    // Was data archived when deactivated?
  },
  rollbackPossible: {
    type: Boolean,
    default: true,
    // Can this change be rolled back?
  },
}, {
  timestamps: true,
});

// Indexes
moduleChangeHistorySchema.index({ tenantId: 1, changedAt: -1 });
moduleChangeHistorySchema.index({ moduleId: 1, changedAt: -1 });

module.exports = mongoose.model('ModuleChangeHistory', moduleChangeHistorySchema);
