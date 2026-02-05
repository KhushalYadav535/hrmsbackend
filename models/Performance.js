const mongoose = require('mongoose');

const performanceSchema = new mongoose.Schema({
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
  period: {
    type: String,
    required: true,
    trim: true, // e.g., "Q1 2026", "2026 Annual"
  },
  raterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  raterName: {
    type: String,
    required: true,
  },
  communicationRating: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
  },
  teamworkRating: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
  },
  leadershipRating: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
  },
  technicalSkillsRating: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
  },
  overallRating: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
  },
  feedback: {
    type: String,
    trim: true,
  },
  goals: [
    {
      title: String,
      description: String,
      targetDate: Date,
      status: {
        type: String,
        enum: ['Not Started', 'In Progress', 'Completed', 'Cancelled'],
        default: 'Not Started',
      },
    },
  ],
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Reviewed', 'Approved'],
    default: 'Draft',
  },
  reviewDate: {
    type: Date,
    default: Date.now,
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

performanceSchema.index({ tenantId: 1, employeeId: 1 });
performanceSchema.index({ tenantId: 1, period: 1 });

performanceSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Performance', performanceSchema);
