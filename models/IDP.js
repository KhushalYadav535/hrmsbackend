const mongoose = require('mongoose');

/**
 * Individual Development Plan (IDP) Model
 * BRD Requirement: BR-AMS-011
 * Employee growth and capability building plan
 */
const idpSchema = new mongoose.Schema({
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
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  appraisalCycleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AppraisalCycle',
    comment: 'IDP created from this appraisal',
  },
  managerAppraisalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManagerAppraisal',
  },
  // Skill gaps identified
  skillGaps: [{
    skill: String,
    currentLevel: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
    },
    requiredLevel: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
    },
  }],
  // Training needs
  trainingNeeds: [{
    area: String,
    type: {
      type: String,
      enum: ['Technical', 'Behavioral', 'Leadership', 'Domain'],
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
    },
    preferredMode: {
      type: String,
      enum: ['Classroom', 'Online', 'Workshop', 'Certification', 'On-the-Job'],
    },
    timeline: Date,
    status: {
      type: String,
      enum: ['Planned', 'Enrolled', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Planned',
    },
  }],
  // Career goals
  shortTermGoals: [{
    goal: String,
    timeline: Date,
    status: {
      type: String,
      enum: ['Not Started', 'In Progress', 'Achieved', 'Deferred'],
      default: 'Not Started',
    },
  }],
  longTermGoals: [{
    goal: String,
    timeline: Date,
    // Note: Long-term goals typically span 3-5 years
  }],
  // Development activities
  developmentActivities: [{
    activity: String,
    type: {
      type: String,
      enum: ['Training', 'Mentoring', 'Stretch Assignment', 'Job Rotation', 'Project', 'Certification'],
    },
    description: String,
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ['Planned', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Planned',
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
  }],
  // Mentoring
  mentoringRequired: {
    type: Boolean,
    default: false,
  },
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  mentoringAreas: [String],
  // Manager support commitments
  managerSupport: [{
    commitment: String,
    timeline: Date,
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed'],
      default: 'Pending',
    },
  }],
  // Review schedule (quarterly)
  quarterlyReviews: [{
    reviewDate: Date,
    reviewedDate: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
    },
    comments: String,
    status: {
      type: String,
      enum: ['Scheduled', 'Completed', 'Missed'],
      default: 'Scheduled',
    },
  }],
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Finalized', 'Active', 'Under Review', 'Completed'],
    default: 'Draft',
  },
  finalizedDate: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

idpSchema.index({ tenantId: 1, employeeId: 1 });
idpSchema.index({ tenantId: 1, managerId: 1 });
idpSchema.index({ tenantId: 1, status: 1 });

idpSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('IDP', idpSchema);
