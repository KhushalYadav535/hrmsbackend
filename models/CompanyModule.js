const mongoose = require('mongoose');

/**
 * Company Modules
 * Tracks which modules are activated for each company (tenant)
 * BRD: Dynamic Module Management System - DM-002
 */
const companyModuleSchema = new mongoose.Schema({
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
  
  // Activation status
  isEnabled: {
    type: Boolean,
    default: true,
    // Current status of module for this company
    index: true,
  },
  activationDate: {
    type: Date,
    required: true,
    // When module was first activated
  },
  deactivationDate: {
    type: Date,
    // When module was deactivated (if applicable)
  },
  trialStartDate: {
    type: Date,
    // Trial period start
  },
  trialEndDate: {
    type: Date,
    // Trial period end
  },
  subscriptionStartDate: {
    type: Date,
    // Paid subscription start
  },
  subscriptionEndDate: {
    type: Date,
    // Subscription expiry
  },
  autoRenew: {
    type: Boolean,
    default: true,
    // Auto-renew subscription?
  },
  
  // Pricing
  pricingModel: {
    type: String,
    enum: ['FLAT_FEE', 'PER_USER', 'PER_TRANSACTION', 'BUNDLED'],
    // Can override platform default
  },
  monthlyCost: {
    type: Number,
    default: 0,
    // Negotiated cost for this company
  },
  currency: {
    type: String,
    default: 'INR',
    maxlength: 3,
  },
  billingCycle: {
    type: String,
    enum: ['MONTHLY', 'QUARTERLY', 'ANNUAL'],
    default: 'MONTHLY',
  },
  
  // Usage tracking
  userLimit: {
    type: Number,
    // Max users allowed for this module (if per-user pricing)
  },
  currentUserCount: {
    type: Number,
    default: 0,
    // Current active users
  },
  transactionLimit: {
    type: Number,
    // Max transactions/month (if applicable)
  },
  currentTransactionCount: {
    type: Number,
    default: 0,
    // Current month transactions
  },
  storageLimitGb: {
    type: Number,
    // Storage limit for this module
  },
  currentStorageGb: {
    type: Number,
    default: 0,
  },
  
  // Configuration
  moduleConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    // Company-specific configuration for this module
    // Example: {"max_leave_days": 30, "payroll_cycle": "monthly"}
  },
  customPermissions: {
    type: [String],
    default: [],
    // Override default permissions if needed
  },
  
  // Workflow
  requestedBy: {
    type: String,
    // Company admin who requested activation
  },
  requestedAt: {
    type: Date,
  },
  approvedBy: {
    type: String,
    // Platform admin who approved
  },
  approvedAt: {
    type: Date,
  },
  activationNotes: {
    type: String,
    // Reason for activation
  },
  deactivationReason: {
    type: String,
    // Reason if deactivated
  },
  deactivatedBy: {
    type: String,
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

// Unique constraint: one module per tenant
companyModuleSchema.index({ tenantId: 1, moduleId: 1 }, { unique: true });

// Indexes for queries
companyModuleSchema.index({ tenantId: 1, isEnabled: 1 });

module.exports = mongoose.model('CompanyModule', companyModuleSchema);
