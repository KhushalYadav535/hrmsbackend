const mongoose = require('mongoose');

/**
 * Manager Appraisal Model
 * BRD Requirement: BR-AMS-005
 * Manager appraisal with goal ratings, competency ratings, overall rating, promotion/increment recommendations
 */
const managerAppraisalSchema = new mongoose.Schema({
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
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  selfAppraisalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SelfAppraisal',
    required: true,
  },
  // Goal-wise ratings
  goalRatings: [{
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal',
      required: true,
    },
    managerRating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    selfRating: {
      type: Number,
      min: 1,
      max: 5,
      comment: 'From self-appraisal for comparison',
    },
    achievementComments: {
      type: String,
      trim: true,
    },
    gapComments: {
      type: String,
      trim: true,
      comment: 'Comments on gaps',
    },
  }],
  // Behavioral Competencies Rating
  competencyRatings: {
    leadership: { type: Number, min: 1, max: 5 },
    communication: { type: Number, min: 1, max: 5 },
    teamwork: { type: Number, min: 1, max: 5 },
    problemSolving: { type: Number, min: 1, max: 5 },
    customerFocus: { type: Number, min: 1, max: 5 },
    innovation: { type: Number, min: 1, max: 5 },
    integrity: { type: Number, min: 1, max: 5 },
    accountability: { type: Number, min: 1, max: 5 },
  },
  // Organizational Values Rating
  valuesRating: {
    type: Number,
    min: 1,
    max: 5,
  },
  // Calculated scores
  kpaScore: {
    type: Number,
    min: 0,
    max: 5,
    comment: 'Weighted average of goal ratings',
  },
  competencyScore: {
    type: Number,
    min: 0,
    max: 5,
    comment: 'Average of competency ratings',
  },
  valuesScore: {
    type: Number,
    min: 0,
    max: 5,
  },
  overallRating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
    comment: 'Final overall rating',
  },
  // Recommendations
  promotionRecommended: {
    type: Boolean,
    default: false,
  },
  promotionJustification: String,
  incrementPercentage: {
    type: Number,
    min: 0,
    max: 100,
    comment: 'Recommended increment percentage',
  },
  trainingNeeds: [{
    area: String,
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
    },
  }],
  // Manager comments
  strengths: String,
  areasForImprovement: String,
  overallComments: String,
  // Status and workflow
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Under Normalization', 'Normalized', 'HR Reviewed', 'Approved', 'Rejected'],
    default: 'Draft',
  },
  submittedDate: Date,
  normalizedDate: Date,
  normalizedRating: {
    type: Number,
    min: 1,
    max: 5,
    comment: 'Rating after normalization',
  },
  normalizationComments: String,
  hrReviewedDate: Date,
  hrReviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  hrComments: String,
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

managerAppraisalSchema.index({ tenantId: 1, employeeId: 1, appraisalCycleId: 1 }, { unique: true });
managerAppraisalSchema.index({ tenantId: 1, managerId: 1, status: 1 });
managerAppraisalSchema.index({ tenantId: 1, appraisalCycleId: 1, status: 1 });

managerAppraisalSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Calculate KPA score (weighted average of goal ratings)
  if (this.goalRatings && this.goalRatings.length > 0) {
    let totalWeightedRating = 0;
    let totalWeightage = 0;
    
    this.goalRatings.forEach(gr => {
      // Get goal weightage from Goal model (would need to populate)
      // For now, assume equal weightage
      const weightage = 100 / this.goalRatings.length;
      totalWeightedRating += gr.managerRating * weightage;
      totalWeightage += weightage;
    });
    
    this.kpaScore = totalWeightage > 0 ? totalWeightedRating / totalWeightage : 0;
  }
  
  // Calculate competency score (average)
  if (this.competencyRatings) {
    const competencies = Object.values(this.competencyRatings).filter(v => v !== undefined && v !== null);
    if (competencies.length > 0) {
      this.competencyScore = competencies.reduce((sum, val) => sum + val, 0) / competencies.length;
    }
  }
  
  // Calculate overall rating based on weightages (if cycle weightages available)
  // For now, use simple average or weighted based on cycle config
  
  next();
});

module.exports = mongoose.model('ManagerAppraisal', managerAppraisalSchema);
