const mongoose = require('mongoose');

/**
 * Continuous Feedback Model
 * BRD Requirement: BR-AMS-003
 * Ongoing performance dialogue - manager-to-employee, peer-to-peer, self-reflection
 */
const feedbackSchema = new mongoose.Schema({
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
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    comment: 'Who is giving feedback',
  },
  fromUserRole: {
    type: String,
    enum: ['Manager', 'Peer', 'Self', 'Direct Report', 'Customer'],
    required: true,
  },
  // Feedback type
  feedbackType: {
    type: String,
    enum: ['Manager-to-Employee', 'Peer-to-Peer', 'Self-Reflection', 'Milestone Achievement', 'Goal-Related'],
    required: true,
  },
  // Related goal (if applicable)
  goalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal',
    comment: 'Tag feedback to specific goal',
  },
  // Feedback content
  feedback: {
    type: String,
    required: true,
    trim: true,
  },
  // Visibility
  visibility: {
    type: String,
    enum: ['Private', 'Shared'],
    default: 'Shared',
    comment: 'Private = only manager, Shared = visible to employee',
  },
  // Milestone achievement (if applicable)
  milestoneAchievement: {
    milestone: String,
    achievementDate: Date,
    impact: String,
  },
  // Tags
  tags: [String],
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Published'],
    default: 'Published',
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

feedbackSchema.index({ tenantId: 1, employeeId: 1 });
feedbackSchema.index({ tenantId: 1, fromUserId: 1 });
feedbackSchema.index({ tenantId: 1, goalId: 1 });
feedbackSchema.index({ tenantId: 1, createdAt: -1 });

feedbackSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Feedback', feedbackSchema);
