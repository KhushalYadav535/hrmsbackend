const mongoose = require('mongoose');

/**
 * Training Assignment Model - LMS
 * BRD: BR-P1-005 - Learning Management System
 */
const trainingAssignmentSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  assignmentType: {
    type: String,
    enum: ['MANDATORY', 'NOMINATED', 'SELF_ENROLLED'],
    required: true,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  assignedDate: {
    type: Date,
    default: Date.now,
  },
  trainingDate: {
    type: Date,
    comment: 'Scheduled training date',
  },
  trainingEndDate: {
    type: Date,
    comment: 'Training completion deadline',
  },
  status: {
    type: String,
    enum: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
    default: 'ASSIGNED',
    index: true,
  },
  completionDate: {
    type: Date,
  },
  attendance: {
    type: String,
    enum: ['PRESENT', 'ABSENT', 'PARTIAL'],
  },
  attendancePercentage: {
    type: Number,
    min: 0,
    max: 100,
  },
  score: {
    type: Number,
    min: 0,
    max: 100,
    comment: 'Assessment score (%)',
  },
  passed: {
    type: Boolean,
    default: false,
  },
  certificateIssued: {
    type: Boolean,
    default: false,
  },
  certificateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Certificate',
  },
  certificateIssueDate: {
    type: Date,
  },
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    comments: String,
    feedbackDate: Date,
  },
  effectivenessRating: {
    type: Number,
    min: 1,
    max: 5,
    comment: 'HR/Manager rating on training effectiveness',
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

trainingAssignmentSchema.index({ tenantId: 1, employeeId: 1, status: 1 });
trainingAssignmentSchema.index({ tenantId: 1, courseId: 1, status: 1 });
trainingAssignmentSchema.index({ tenantId: 1, trainingDate: 1 });

trainingAssignmentSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('TrainingAssignment', trainingAssignmentSchema);
