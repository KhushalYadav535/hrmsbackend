const mongoose = require('mongoose');

/**
 * Goal Model (SMART Goals / KRA/KPI)
 * BRD Requirement: BR-AMS-002
 * SMART goal setting with cascading from organizational to department to individual
 */
const goalSchema = new mongoose.Schema({
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
  // Goal cascading hierarchy
  goalLevel: {
    type: String,
    enum: ['Organizational', 'Departmental', 'Individual'],
    default: 'Individual',
  },
  parentGoalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal',
    comment: 'For cascading - links to parent goal',
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    comment: 'For departmental goals',
  },
  // SMART Goal components
  description: {
    type: String,
    required: true,
    trim: true,
    comment: 'Specific - What needs to be achieved',
  },
  kpi: {
    type: String,
    required: true,
    trim: true,
    comment: 'Key Performance Indicator / Metric',
  },
  target: {
    type: String,
    required: true,
    trim: true,
    comment: 'Measurable - Target value',
  },
  currentValue: {
    type: String,
    trim: true,
    comment: 'Current achievement value',
  },
  weightage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    comment: 'Weightage percentage',
  },
  timeline: {
    type: String,
    required: true,
    trim: true,
    comment: 'Time-bound - Deadline',
  },
  measurementCriteria: {
    type: String,
    trim: true,
    comment: 'How achievement will be measured',
  },
  category: {
    type: String,
    enum: ['Financial', 'Customer Service', 'Process Improvement', 'Learning & Development', 'Operational', 'Strategic'],
    default: 'Operational',
  },
  // Goal status and tracking
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Approved', 'In Progress', 'Completed', 'Cancelled', 'Modified'],
    default: 'Draft',
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
    comment: 'Progress percentage',
  },
  // Approval workflow
  submittedDate: Date,
  approvedDate: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvalComments: String,
  // Goal modification
  wasModified: {
    type: Boolean,
    default: false,
  },
  modificationReason: String,
  modificationApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  modificationDate: Date,
  // Mid-year review
  midYearReview: {
    reviewedDate: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    comments: String,
    progressAtMidYear: Number,
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

goalSchema.index({ tenantId: 1, employeeId: 1, appraisalCycleId: 1 });
goalSchema.index({ tenantId: 1, appraisalCycleId: 1, status: 1 });
goalSchema.index({ tenantId: 1, parentGoalId: 1 });
goalSchema.index({ tenantId: 1, departmentId: 1 });

goalSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Goal', goalSchema);
