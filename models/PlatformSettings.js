const mongoose = require('mongoose');

/**
 * Platform-level Settings
 * BRD: White-label, Billing cycle, Auto-renew, etc.
 */
const platformSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
  },
  category: {
    type: String,
    enum: ['BILLING', 'WHITELABEL', 'GENERAL', 'SECURITY'],
    default: 'GENERAL',
  },
  description: {
    type: String,
  },
  updatedBy: {
    type: String,
  },
}, { timestamps: true });

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
