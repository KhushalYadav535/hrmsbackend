const mongoose = require('mongoose');

/**
 * Appraisal Cycle Model
 * BRD Requirement: BR-AMS-001
 * Configurable appraisal cycles (annual, half-yearly, quarterly)
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
    comment: 'e.g., "FY 2025-26 Annual", "H1 2026"',
  },
  cycleType: {
    type: String,
    enum: ['Annual', 'Half-Yearly', 'Quarterly'],
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
  // Timeline for stages
  goalSettingStartDate: {
    type: Date,
    required: true,
  },
  goalSettingEndDate: {
    type: Date,
    required: true,
  },
  midYearReviewDate: {
    type: Date,
    comment: 'For annual cycles',
  },
  selfAppraisalStartDate: {
    type: Date,
    required: true,
  },
  selfAppraisalEndDate: {
    type: Date,
    required: true,
  },
  managerReviewStartDate: {
    type: Date,
    required: true,
  },
  managerReviewEndDate: {
    type: Date,
    required: true,
  },
  normalizationStartDate: {
    type: Date,
  },
  normalizationEndDate: {
    type: Date,
  },
  hrApprovalStartDate: {
    type: Date,
  },
  hrApprovalEndDate: {
    type: Date,
  },
  // Rating configuration
  ratingScale: {
    type: String,
    enum: ['Numeric_1_5', 'Descriptive'],
    default: 'Numeric_1_5',
  },
  ratingLabels: {
    1: { type: String, default: 'Unsatisfactory' },
    2: { type: String, default: 'Needs Improvement' },
    3: { type: String, default: 'Meets Expectations' },
    4: { type: String, default: 'Exceeds Expectations' },
    5: { type: String, default: 'Exceptional' },
  },
  // Component weightages
  componentWeightages: {
    kpa: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
      comment: 'Key Performance Areas (Goals)',
    },
    competencies: {
      type: Number,
      default: 20,
      min: 0,
      max: 100,
    },
    values: {
      type: Number,
      default: 10,
      min: 0,
      max: 100,
    },
  },
  // Eligibility criteria
  minimumTenureMonths: {
    type: Number,
    default: 6,
    comment: 'Minimum service required for appraisal',
  },
  excludeProbationers: {
    type: Boolean,
    default: true,
  },
  // Bell curve distribution (if applicable)
  bellCurveEnabled: {
    type: Boolean,
    default: false,
  },
  bellCurveDistribution: {
    exceptional: { type: Number, default: 10, comment: 'Rating 5' },
    exceeds: { type: Number, default: 20, comment: 'Rating 4' },
    meets: { type: Number, default: 60, comment: 'Rating 3' },
    needsImprovement: { type: Number, default: 8, comment: 'Rating 2' },
    unsatisfactory: { type: Number, default: 2, comment: 'Rating 1' },
  },
  status: {
    type: String,
    enum: ['Draft', 'Active', 'Completed', 'Cancelled'],
    default: 'Draft',
  },
  applicableDepartments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
  }],
  applicableGrades: [{
    type: String,
    trim: true,
  }],
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

appraisalCycleSchema.index({ tenantId: 1, status: 1 });
appraisalCycleSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });
appraisalCycleSchema.index({ tenantId: 1, cycleType: 1 });

appraisalCycleSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  // Validate weightages sum to 100
  const totalWeightage = this.componentWeightages.kpa + this.componentWeightages.competencies + this.componentWeightages.values;
  if (totalWeightage !== 100) {
    return next(new Error('Component weightages must sum to 100'));
  }
  next();
});

module.exports = mongoose.model('AppraisalCycle', appraisalCycleSchema);
