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
}, { timestamps: true });

module.exports = mongoose.model('PlatformIntegration', platformIntegrationSchema);
