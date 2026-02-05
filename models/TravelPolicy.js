const mongoose = require('mongoose');

/**
 * Travel Policy Model
 * BRD Requirement: BR-TRV-002
 * Grade-based travel policy enforcement
 */
const travelPolicySchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  grade: {
    type: String,
    required: true,
    trim: true,
    comment: 'Employee grade (Scale I to Scale VII)',
  },
  // Air travel entitlements
  airTravel: {
    domestic: {
      class: {
        type: String,
        enum: ['Economy', 'Business', 'First'],
        default: 'Economy',
      },
      maxAmount: Number,
    },
    international: {
      class: {
        type: String,
        enum: ['Economy', 'Business', 'First'],
        default: 'Economy',
      },
      maxAmount: Number,
    },
  },
  // Train travel entitlements
  trainTravel: {
    class: {
      type: String,
      enum: ['AC-I', 'AC-II', 'AC-III', 'Sleeper', 'General'],
      default: 'AC-II',
    },
    maxAmount: Number,
  },
  // Daily Allowance (DA) rates by city classification
  dailyAllowance: {
    A1: { type: Number, default: 0, comment: 'Metro cities' },
    A: { type: Number, default: 0 },
    B: { type: Number, default: 0 },
    C: { type: Number, default: 0 },
  },
  // Hotel entitlements
  hotel: {
    category: {
      type: String,
      enum: ['5-Star', '4-Star', '3-Star', '2-Star', 'Budget'],
      default: '3-Star',
    },
    maxRoomRent: {
      type: Number,
      default: 0,
      comment: 'Maximum room rent per night',
    },
  },
  // Mileage allowance for own vehicle
  mileageAllowance: {
    twoWheeler: {
      type: Number,
      default: 8,
      comment: 'Rate per km for two-wheeler',
    },
    fourWheeler: {
      type: Number,
      default: 12,
      comment: 'Rate per km for four-wheeler',
    },
    maxMonthlyKm: {
      type: Number,
      default: 500,
      comment: 'Maximum km per month',
    },
  },
  // Advance limits
  advanceLimit: {
    percentage: {
      type: Number,
      default: 80,
      min: 0,
      max: 100,
      comment: 'Percentage of estimated expense (default 80%)',
    },
    maxAmount: {
      type: Number,
      default: 0,
      comment: 'Maximum advance amount (0 = no limit)',
    },
    financeApprovalThreshold: {
      type: Number,
      default: 50000,
      comment: 'Amount above which finance approval required',
    },
  },
  // Claim submission deadline
  claimSubmissionDeadline: {
    type: Number,
    default: 30,
    comment: 'Days after travel to submit claim',
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
  },
  description: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

travelPolicySchema.index({ tenantId: 1, grade: 1 }, { unique: true });
travelPolicySchema.index({ tenantId: 1, status: 1 });

travelPolicySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('TravelPolicy', travelPolicySchema);
