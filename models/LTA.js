const mongoose = require('mongoose');

/**
 * Leave Travel Allowance (LTA) Model
 * BRD Requirement: BR-TRV-003, BR-TRV-011
 * LTA block management and tracking
 */
const ltaSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  blockYear: {
    type: String,
    required: true,
    comment: 'LTA block year (e.g., 2022-2025)',
  },
  blockStartDate: {
    type: Date,
    required: true,
  },
  blockEndDate: {
    type: Date,
    required: true,
  },
  totalJourneys: {
    type: Number,
    default: 2,
    comment: 'Total journeys allowed per block (default 2)',
  },
  journeysUtilized: {
    type: Number,
    default: 0,
  },
  journeysRemaining: {
    type: Number,
    default: 2,
  },
  // Journey details
  journeys: [{
    journeyDate: Date,
    origin: String,
    destination: String,
    mode: {
      type: String,
      enum: ['Train', 'Air', 'Public Transport'],
    },
    familyMembers: [{
      name: String,
      relationship: {
        type: String,
        enum: ['Self', 'Spouse', 'Child'],
      },
    }],
    actualFare: Number,
    entitledClassFare: Number,
    eligibleAmount: {
      type: Number,
      comment: 'Lower of actual or entitled class fare',
    },
    ticketCopies: [{
      name: String,
      url: String,
      uploadedDate: Date,
    }],
    ltaDeclaration: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Paid'],
      default: 'Draft',
    },
    approvedDate: Date,
    paidDate: Date,
  }],
  // Carry forward
  canCarryForward: {
    type: Boolean,
    default: false,
    comment: 'Whether unused LTA can be carried forward',
  },
  carryForwardAmount: {
    type: Number,
    default: 0,
  },
  // Tax exemption
  taxExemptAmount: {
    type: Number,
    default: 0,
    comment: 'Total tax-exempt LTA amount',
  },
  status: {
    type: String,
    enum: ['Active', 'Completed', 'Expired'],
    default: 'Active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

ltaSchema.index({ tenantId: 1, employeeId: 1, blockYear: 1 }, { unique: true });
ltaSchema.index({ tenantId: 1, blockYear: 1 });
ltaSchema.index({ tenantId: 1, employeeId: 1 });

ltaSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  // Auto-calculate remaining journeys
  this.journeysRemaining = this.totalJourneys - this.journeysUtilized;
  
  // Calculate eligible amount for each journey (lower of actual or entitled)
  this.journeys.forEach(journey => {
    if (journey.actualFare && journey.entitledClassFare) {
      journey.eligibleAmount = Math.min(journey.actualFare, journey.entitledClassFare);
    }
  });
  
  // Calculate total tax-exempt amount
  this.taxExemptAmount = this.journeys
    .filter(j => j.status === 'Approved' || j.status === 'Paid')
    .reduce((sum, j) => sum + (j.eligibleAmount || 0), 0);
  
  next();
});

module.exports = mongoose.model('LTA', ltaSchema);
