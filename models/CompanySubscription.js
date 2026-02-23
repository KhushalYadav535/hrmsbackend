const mongoose = require('mongoose');

/**
 * Company Subscriptions
 * Maps companies (tenants) to subscription packages
 * BRD: Dynamic Module Management System - DM-005
 */
const companySubscriptionSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    unique: true,
    index: true,
  },
  packageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPackage',
    index: true,
  },
  
  subscriptionType: {
    type: String,
    required: true,
    enum: ['PACKAGE_BASED', 'CUSTOM', 'TRIAL'],
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'TRIAL', 'EXPIRED', 'CANCELLED', 'SUSPENDED'],
    default: 'ACTIVE',
    index: true,
  },
  
  // Dates
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
  },
  trialEndDate: {
    type: Date,
  },
  autoRenew: {
    type: Boolean,
    default: true,
  },
  
  // Pricing
  totalMonthlyCost: {
    type: Number,
    required: true,
    // Total cost including all modules
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
  
  // Payment
  paymentMethod: {
    type: String,
  },
  lastPaymentDate: {
    type: Date,
  },
  nextBillingDate: {
    type: Date,
  },
  
  // Limits
  userLimit: {
    type: Number,
  },
  currentUsers: {
    type: Number,
    default: 0,
  },
  storageLimitGb: {
    type: Number,
  },
  currentStorageGb: {
    type: Number,
    default: 0,
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

module.exports = mongoose.model('CompanySubscription', companySubscriptionSchema);
