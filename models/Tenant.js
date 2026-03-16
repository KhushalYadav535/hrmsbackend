const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  location: {
    type: String,
    required: true,
  },
  // Spec A2/A4: Expanded statuses for registration workflow + suspension
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending', 'suspended', 'rejected'],
    default: 'active',
    index: true,
  },
  employees: {
    type: Number,
    default: 0,
  },
  settings: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {},
  },
  // Spec A2-01: Registration tracking
  registrationEmail: {
    type: String,
    lowercase: true,
    trim: true,
  },
  registrationOtpHash: String,
  registrationOtpExpiry: Date,
  emailVerified: {
    type: Boolean,
    default: false,
  },
  // Spec A2-02: Approval workflow
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: Date,
  rejectionReason: String,
  // Spec A4-01: Suspension/Deactivation tracking
  suspendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  suspendedAt: Date,
  suspensionReason: {
    type: String,
    minlength: 20,
  },
  deactivatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  deactivatedAt: Date,
  deactivationReason: {
    type: String,
    minlength: 20,
  },
  // Subscription tracking
  subscriptionPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPackage',
  },
  subscriptionExpiryDate: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

tenantSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified()) {
    this.updatedAt = Date.now();
  }
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Tenant', tenantSchema);
