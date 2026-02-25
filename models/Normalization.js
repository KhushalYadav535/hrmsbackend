const mongoose = require('mongoose');

/**
 * Normalization Model
 * BRD Requirement: BR-AMS-007
 * Rating normalization and calibration to ensure fair distribution (bell curve)
 */
const normalizationSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  appraisalCycleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AppraisalCycle',
    required: true,
    index: true,
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    comment: 'Department-wise normalization',
  },
  // Target distribution (from cycle config)
  targetDistribution: {
    exceptional: { type: Number, default: 10 },
    exceeds: { type: Number, default: 20 },
    meets: { type: Number, default: 60 },
    needsImprovement: { type: Number, default: 8 },
    unsatisfactory: { type: Number, default: 2 },
  },
  // Actual distribution before normalization
  actualDistribution: {
    exceptional: { type: Number, default: 0 },
    exceeds: { type: Number, default: 0 },
    meets: { type: Number, default: 0 },
    needsImprovement: { type: Number, default: 0 },
    unsatisfactory: { type: Number, default: 0 },
  },
  // Rating adjustments
  ratingAdjustments: [{
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    managerAppraisalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ManagerAppraisal',
      required: true,
    },
    originalRating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    normalizedRating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    justification: {
      type: String,
      required: true,
      trim: true,
    },
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    adjustedDate: {
      type: Date,
      default: Date.now,
    },
  }],
  // Force ranking
  forceRanking: [{
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    rank: Number,
    rating: Number,
  }],
  // Calibration session
  calibrationSession: {
    conductedDate: Date,
    conductedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    sessionNotes: String,
  },
  // Status
  status: {
    type: String,
    enum: ['Draft', 'In Progress', 'Completed', 'Approved'],
    default: 'Draft',
  },
  completedDate: Date,
  approvedDate: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

normalizationSchema.index({ tenantId: 1, appraisalCycleId: 1, departmentId: 1 });
normalizationSchema.index({ tenantId: 1, appraisalCycleId: 1, status: 1 });

normalizationSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('Normalization', normalizationSchema);
