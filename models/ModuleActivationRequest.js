const mongoose = require('mongoose');

/**
 * Module Activation Requests
 * Company admins request module activation
 * BRD: Dynamic Module Management System - DM-003
 */
const moduleActivationRequestSchema = new mongoose.Schema({
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
  
  requestType: {
    type: String,
    required: true,
    enum: ['ACTIVATION', 'DEACTIVATION', 'TRIAL', 'UPGRADE'],
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
    index: true,
  },
  
  // Request details
  requestedBy: {
    type: String,
    required: true,
    // Company admin
  },
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  businessJustification: {
    type: String,
    required: true,
    // Why is this module needed?
  },
  expectedUsers: {
    type: Number,
    // Expected number of users
  },
  expectedUsage: {
    type: String,
    // Expected usage pattern
  },
  trialRequested: {
    type: Boolean,
    default: false,
    // Request trial first?
  },
  trialDurationDays: {
    type: Number,
    default: 30,
  },
  
  // Approval workflow
  reviewedBy: {
    type: String,
    // Platform admin
  },
  reviewedAt: {
    type: Date,
  },
  reviewComments: {
    type: String,
  },
  approvedAt: {
    type: Date,
  },
  rejectedAt: {
    type: Date,
  },
  rejectionReason: {
    type: String,
  },
  
  // Pricing (if custom quote needed)
  quotedPrice: {
    type: Number,
  },
  quoteValidUntil: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Indexes
moduleActivationRequestSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('ModuleActivationRequest', moduleActivationRequestSchema);
