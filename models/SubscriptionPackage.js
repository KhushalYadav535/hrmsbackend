const mongoose = require('mongoose');

/**
 * Subscription Packages (Templates)
 * Pre-defined module bundles for different subscription tiers
 * BRD: Dynamic Module Management System - DM-004
 */
const subscriptionPackageSchema = new mongoose.Schema({
  packageCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  packageName: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  packageTier: {
    type: String,
    required: true,
    enum: ['BASIC', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CUSTOM'],
    index: true,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  
  // Pricing
  monthlyPrice: {
    type: Number,
    required: true,
  },
  annualPrice: {
    type: Number,
    // Annual price (with discount)
  },
  currency: {
    type: String,
    default: 'INR',
    maxlength: 3,
  },
  
  // Limits
  maxUsers: {
    type: Number,
  },
  maxStorageGb: {
    type: Number,
  },
  
  // Included modules (array of module_codes)
  includedModules: {
    type: [String],
    required: true,
    default: [],
    // Example: ["PIS", "PAYROLL", "LEAVE", "ATTENDANCE"]
  },
  
  // Features
  features: {
    type: [String],
    default: [],
    // Human-readable feature list
    // Example: ["Up to 500 employees", "Email support", "Basic reports"]
  },
  
  createdBy: {
    type: String,
  },
  updatedBy: {
    type: String,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('SubscriptionPackage', subscriptionPackageSchema);
