const mongoose = require('mongoose');

/**
 * Performance Improvement Plan (PIP) Model
 * BRD Requirement: BR-AMS-009
 * Structured support for underperformers
 */
const pipSchema = new mongoose.Schema({
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
    comment: 'PIP initiated from this appraisal',
  },
  managerAppraisalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManagerAppraisal',
  },
  // Performance gaps identified
  performanceGaps: [{
    area: String,
    description: String,
    currentLevel: String,
    expectedLevel: String,
  }],
  // Improvement goals
  improvementGoals: [{
    goal: String,
    target: String,
    measurementCriteria: String,
    timeline: Date,
    status: {
      type: String,
      enum: ['Not Started', 'In Progress', 'Completed', 'Not Met'],
      default: 'Not Started',
    },
  }],
  // Action plan
  actionPlan: [{
    action: String,
    responsible: {
      type: String,
      enum: ['Employee', 'Manager', 'HR', 'Training Team'],
    },
    timeline: Date,
    resources: String,
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed'],
      default: 'Pending',
    },
  }],
  // Timeline
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
    comment: 'Typically 90 days, extendable to 180',
  },
  extendedEndDate: Date,
  extensionReason: String,
  // Review milestones (every 30 days)
  reviewMilestones: [{
    milestoneDate: Date,
    reviewDate: Date,
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
  // Support and resources
  supportProvided: [{
    type: String,
    description: String,
    providedDate: Date,
  }],
  // Final assessment
  finalAssessment: {
    assessmentDate: Date,
    assessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    outcome: {
      type: String,
      enum: ['Successful Completion', 'Extension Required', 'Termination Recommended'],
    },
    assessmentComments: String,
    overallProgress: {
      type: Number,
      min: 0,
      max: 100,
    },
  },
  // Workflow
  status: {
    type: String,
    enum: ['Draft', 'Proposed', 'HR Approved', 'Employee Acknowledged', 'Active', 'Under Review', 'Completed', 'Extended', 'Terminated'],
    default: 'Draft',
  },
  proposedDate: Date,
  hrApprovedDate: Date,
  hrApproverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  employeeAcknowledgedDate: Date,
  employeeComments: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

pipSchema.index({ tenantId: 1, employeeId: 1 });
pipSchema.index({ tenantId: 1, managerId: 1, status: 1 });
pipSchema.index({ tenantId: 1, status: 1 });

pipSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('PIP', pipSchema);
