const mongoose = require('mongoose');

/**
 * Appraisal Cycle Model
 * BRD: BR-P1-001 - Performance Appraisal Complete Workflow
 */
const appraisalCycleSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  cycleName: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  cycleType: {
    type: String,
    enum: ['ANNUAL', 'HALF_YEARLY', 'QUARTERLY', 'PROBATION_REVIEW'],
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  selfAssessmentDeadline: {
    type: Date,
    required: true,
  },
  managerReviewDeadline: {
    type: Date,
    required: true,
  },
  normalizationDeadline: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'CLOSED'],
    default: 'DRAFT',
    index: true,
  },
  applicableTo: {
    type: String,
    enum: ['ALL', 'DEPARTMENTS', 'GRADES'],
    default: 'ALL',
  },
  applicableDepartments: [{
    type: String,
    trim: true,
  }],
  applicableGrades: [{
    type: String,
    trim: true,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

appraisalCycleSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('AppraisalCycle', appraisalCycleSchema);
