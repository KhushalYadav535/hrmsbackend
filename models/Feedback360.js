const mongoose = require('mongoose');

/**
 * 360-Degree Feedback Model
 * BRD Requirement: BR-AMS-012
 * Multi-rater feedback (self, manager, peers, direct reports, internal customers)
 */
const feedback360Schema = new mongoose.Schema({
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
  appraisalCycleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AppraisalCycle',
  },
  // Feedback from different raters
  selfFeedback: {
    raterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    competencyRatings: {
      leadership: Number,
      communication: Number,
      teamwork: Number,
      problemSolving: Number,
      customerFocus: Number,
      innovation: Number,
      integrity: Number,
      accountability: Number,
    },
    comments: String,
    submittedDate: Date,
  },
  managerFeedback: {
    raterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    competencyRatings: {
      leadership: Number,
      communication: Number,
      teamwork: Number,
      problemSolving: Number,
      customerFocus: Number,
      innovation: Number,
      integrity: Number,
      accountability: Number,
    },
    comments: String,
    submittedDate: Date,
  },
  peerFeedbacks: [{
    raterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    raterName: String,
    anonymous: {
      type: Boolean,
      default: true,
    },
    competencyRatings: {
      leadership: Number,
      communication: Number,
      teamwork: Number,
      problemSolving: Number,
      customerFocus: Number,
      innovation: Number,
      integrity: Number,
      accountability: Number,
    },
    comments: String,
    submittedDate: Date,
  }],
  directReportFeedbacks: [{
    raterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    raterName: String,
    anonymous: {
      type: Boolean,
      default: true,
    },
    competencyRatings: {
      leadership: Number,
      communication: Number,
      teamwork: Number,
      problemSolving: Number,
      customerFocus: Number,
      innovation: Number,
      integrity: Number,
      accountability: Number,
    },
    comments: String,
    submittedDate: Date,
  }],
  customerFeedbacks: [{
    raterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    raterName: String,
    department: String,
    competencyRatings: {
      customerFocus: Number,
      communication: Number,
      problemSolving: Number,
    },
    comments: String,
    submittedDate: Date,
  }],
  // Consolidated report
  consolidatedReport: {
    averageRatings: {
      leadership: Number,
      communication: Number,
      teamwork: Number,
      problemSolving: Number,
      customerFocus: Number,
      innovation: Number,
      integrity: Number,
      accountability: Number,
    },
    selfVsOthers: {
      leadership: { self: Number, others: Number },
      communication: { self: Number, others: Number },
      teamwork: { self: Number, others: Number },
      problemSolving: { self: Number, others: Number },
      customerFocus: { self: Number, others: Number },
      innovation: { self: Number, others: Number },
      integrity: { self: Number, others: Number },
      accountability: { self: Number, others: Number },
    },
    developmentalInsights: String,
    blindSpots: [String],
    strengths: [String],
    areasForDevelopment: [String],
  },
  // Status
  status: {
    type: String,
    enum: ['Draft', 'In Progress', 'Completed', 'Report Generated'],
    default: 'Draft',
  },
  reportGeneratedDate: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

feedback360Schema.index({ tenantId: 1, employeeId: 1, appraisalCycleId: 1 });
feedback360Schema.index({ tenantId: 1, status: 1 });

feedback360Schema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Feedback360', feedback360Schema);
