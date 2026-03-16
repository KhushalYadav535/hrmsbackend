const mongoose = require('mongoose');

/**
 * Platform Integrations
 * BRD: Integration Management - Biometric, WhatsApp, Email/SMS, CBS, etc.
 */
const platformIntegrationSchema = new mongoose.Schema({
  integrationCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  integrationName: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ['BIOMETRIC', 'MESSAGING', 'EMAIL_SMS', 'BANKING', 'API', 'MOBILE', 'OTHER'],
    default: 'OTHER',
  },
  description: {
    type: String,
  },
  isEnabled: {
    type: Boolean,
    default: false,
  },
  config: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {},
  },
  tenantSpecific: {
    type: Boolean,
    default: false,
  },
  sortOrder: {
    type: Number,
    default: 100,
  },
  // US-A6-02: Integration Health Status
  healthStatus: {
    type: String,
    enum: ['healthy', 'degraded', 'failed', 'not_configured'],
    default: 'not_configured',
  },
  lastHealthCheck: {
    type: Date,
  },
  lastError: {
    type: String,
  },
  // US-A6-02: Health metrics
  healthMetrics: {
    lastSyncTime: Date,
    successCount24h: { type: Number, default: 0 },
    errorCount24h: { type: Number, default: 0 },
    lastErrorMessage: String,
  },
}, { timestamps: true });

module.exports = mongoose.model('PlatformIntegration', platformIntegrationSchema);
