const mongoose = require('mongoose');

/**
 * Appraisal Discussion Model
 * BRD Requirement: BR-AMS-006
 * Structured performance conversation and discussion facilitation
 */
const appraisalDiscussionSchema = new mongoose.Schema({
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
  managerAppraisalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManagerAppraisal',
    required: true,
  },
  // Discussion scheduling
  scheduledDate: {
    type: Date,
    required: true,
  },
  scheduledTime: String,
  meetingLocation: {
    type: String,
    enum: ['In-Person', 'Video Call', 'Phone Call', 'Other'],
    default: 'In-Person',
  },
  meetingLink: String,
  // Discussion agenda (auto-generated)
  agenda: [{
    item: String,
    description: String,
  }],
  // Discussion points
  goalsReviewed: [{
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal',
    },
    discussionPoints: String,
    agreedRating: Number,
  }],
  ratingsDiscussed: {
    type: Boolean,
    default: false,
  },
  employeeFeedback: {
    type: String,
    trim: true,
    comment: 'Employee feedback on appraisal',
  },
  // Development plan finalized
  developmentPlanFinalized: {
    type: Boolean,
    default: false,
  },
  developmentPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IDP',
  },
  // Meeting notes
  meetingNotes: {
    type: String,
    trim: true,
  },
  keyTakeaways: [String],
  actionItems: [{
    item: String,
    assignedTo: {
      type: String,
      enum: ['Employee', 'Manager', 'HR'],
    },
    dueDate: Date,
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed'],
      default: 'Pending',
    },
  }],
  // Employee acknowledgment
  employeeAcknowledged: {
    type: Boolean,
    default: false,
  },
  acknowledgmentDate: Date,
  employeeAgreement: {
    type: String,
    enum: ['Agree', 'Disagree', 'Partially Agree'],
  },
  employeeComments: String,
  // Manager sign-off
  managerSignedOff: {
    type: Boolean,
    default: false,
  },
  managerSignOffDate: Date,
  // Status
  status: {
    type: String,
    enum: ['Scheduled', 'Completed', 'Cancelled', 'Rescheduled'],
    default: 'Scheduled',
  },
  completedDate: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

appraisalDiscussionSchema.index({ tenantId: 1, employeeId: 1, appraisalCycleId: 1 }, { unique: true });
appraisalDiscussionSchema.index({ tenantId: 1, managerId: 1, status: 1 });

appraisalDiscussionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('AppraisalDiscussion', appraisalDiscussionSchema);
