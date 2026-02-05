const mongoose = require('mongoose');

/**
 * Self Appraisal Model
 * BRD Requirement: BR-AMS-004
 * Comprehensive self-appraisal with goal-wise achievement, evidence, challenges, development needs
 */
const selfAppraisalSchema = new mongoose.Schema({
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
  // Goal-wise achievements
  goalAchievements: [{
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal',
      required: true,
    },
    selfRating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    achievementDescription: {
      type: String,
      required: true,
      trim: true,
    },
    quantifiableAchievements: {
      type: String,
      trim: true,
      comment: 'Numbers, percentages, impact',
    },
    evidence: [{
      name: String,
      url: String,
      uploadedDate: Date,
      description: String,
    }],
    challengesFaced: String,
  }],
  // Overall self-rating
  overallSelfRating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  // Additional sections
  keyAccomplishments: {
    type: String,
    trim: true,
    comment: 'Major achievements during the period',
  },
  challengesFaced: {
    type: String,
    trim: true,
  },
  supportNeeded: {
    type: String,
    trim: true,
    comment: 'Support needed from organization',
  },
  trainingNeeds: {
    type: String,
    trim: true,
  },
  developmentNeeds: {
    type: String,
    trim: true,
  },
  careerAspirations: {
    type: String,
    trim: true,
  },
  // File attachments
  attachments: [{
    name: String,
    url: String,
    uploadedDate: Date,
    category: {
      type: String,
      enum: ['Evidence', 'Certificate', 'Achievement', 'Other'],
    },
  }],
  // Status and workflow
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Locked'],
    default: 'Draft',
  },
  submittedDate: Date,
  lockedDate: Date,
  // Self-reflection notes (private)
  privateNotes: {
    type: String,
    trim: true,
    comment: 'Visible only to manager',
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

selfAppraisalSchema.index({ tenantId: 1, employeeId: 1, appraisalCycleId: 1 }, { unique: true });
selfAppraisalSchema.index({ tenantId: 1, appraisalCycleId: 1, status: 1 });

selfAppraisalSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  // Lock if submitted
  if (this.status === 'Submitted' && !this.lockedDate) {
    this.lockedDate = new Date();
  }
  next();
});

module.exports = mongoose.model('SelfAppraisal', selfAppraisalSchema);
