const mongoose = require('mongoose');

/**
 * Appraisal Model
 * BRD: BR-P1-001 - Performance Appraisal Complete Workflow
 */
const appraisalSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  cycleId: {
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
    ref: 'Employee',
    required: true,
    index: true,
  },
  
  // Goal Setting (KRA/KPI)
  goals: [{
    goalTitle: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    targetMetric: {
      type: String,
      trim: true,
    },
    measurementUnit: {
      type: String,
      enum: ['PERCENTAGE', 'AMOUNT', 'COUNT', 'OTHER'],
    },
    baselineValue: {
      type: Number,
    },
    targetValue: {
      type: Number,
    },
    weightage: {
      type: Number,
      min: 0,
      max: 100,
    },
    dueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'NOT_ACHIEVED'],
      default: 'NOT_STARTED',
    },
    employeeAchievement: {
      type: Number,
      min: 0,
      max: 100,
      comment: 'Employee self-rated achievement %',
    },
    managerAchievement: {
      type: Number,
      min: 0,
      max: 100,
      comment: 'Manager rated achievement %',
    },
    finalAchievement: {
      type: Number,
      min: 0,
      max: 100,
      comment: 'Final achievement after normalization',
    },
  }],
  
  // Self-Assessment
  selfAssessment: {
    submitted: {
      type: Boolean,
      default: false,
    },
    submittedDate: Date,
    competencyRatings: {
      technicalSkills: { type: Number, min: 1, max: 5 },
      domainKnowledge: { type: Number, min: 1, max: 5 },
      qualityOfWork: { type: Number, min: 1, max: 5 },
      productivity: { type: Number, min: 1, max: 5 },
      initiativeOwnership: { type: Number, min: 1, max: 5 },
      problemSolving: { type: Number, min: 1, max: 5 },
      communicationSkills: { type: Number, min: 1, max: 5 },
      teamworkCollaboration: { type: Number, min: 1, max: 5 },
      leadership: { type: Number, min: 1, max: 5 },
      innovationCreativity: { type: Number, min: 1, max: 5 },
    },
    trainingNeeds: [{
      skill: String,
      program: String,
      priority: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'] },
    }],
    careerAspirations: {
      goals: String,
      preferredPath: String,
    },
    achievements: String,
    challengesFaced: String,
    overallComments: String,
  },
  
  // Manager Review
  managerReview: {
    submitted: {
      type: Boolean,
      default: false,
    },
    submittedDate: Date,
    competencyRatings: {
      technicalSkills: { type: Number, min: 1, max: 5 },
      domainKnowledge: { type: Number, min: 1, max: 5 },
      qualityOfWork: { type: Number, min: 1, max: 5 },
      productivity: { type: Number, min: 1, max: 5 },
      initiativeOwnership: { type: Number, min: 1, max: 5 },
      problemSolving: { type: Number, min: 1, max: 5 },
      communicationSkills: { type: Number, min: 1, max: 5 },
      teamworkCollaboration: { type: Number, min: 1, max: 5 },
      leadership: { type: Number, min: 1, max: 5 },
      innovationCreativity: { type: Number, min: 1, max: 5 },
    },
    overallPerformanceRating: {
      type: Number,
      min: 1,
      max: 5,
      comment: '1=Unsatisfactory, 2=Needs Improvement, 3=Meets Expectations, 4=Exceeds Expectations, 5=Outstanding',
    },
    strengths: String,
    developmentAreas: String,
    developmentPlan: String,
    trainingRecommendations: [String],
    specialAssignments: [String],
    promotionRecommendation: {
      type: Boolean,
      default: false,
    },
    retentionRisk: {
      type: Boolean,
      default: false,
    },
    incrementRecommendation: {
      percentage: Number,
      justification: String,
    },
    commentsToEmployee: String,
  },
  
  // Normalization
  normalization: {
    applied: {
      type: Boolean,
      default: false,
    },
    normalizedRating: {
      type: Number,
      min: 1,
      max: 5,
    },
    normalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    normalizedDate: Date,
    justification: String,
  },
  
  // Final Rating
  finalRating: {
    type: Number,
    min: 1,
    max: 5,
  },
  
  // Increment & Promotion Linkage
  increment: {
    percentage: Number,
    approved: Boolean,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedDate: Date,
  },
  promotion: {
    recommended: Boolean,
    recommendedTo: String,
    approved: Boolean,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedDate: Date,
  },
  
  status: {
    type: String,
    enum: [
      'NOT_STARTED',
      'GOAL_SETTING',
      'SELF_ASSESSMENT_PENDING',
      'SELF_ASSESSMENT_SUBMITTED',
      'MANAGER_REVIEW_PENDING',
      'MANAGER_REVIEW_SUBMITTED',
      'NORMALIZATION_PENDING',
      'NORMALIZED',
      'APPROVED',
      'CLOSED',
    ],
    default: 'NOT_STARTED',
    index: true,
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

appraisalSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
appraisalSchema.index({ tenantId: 1, cycleId: 1, employeeId: 1 }, { unique: true });
appraisalSchema.index({ tenantId: 1, status: 1 });
appraisalSchema.index({ tenantId: 1, managerId: 1 });

module.exports = mongoose.model('Appraisal', appraisalSchema);
