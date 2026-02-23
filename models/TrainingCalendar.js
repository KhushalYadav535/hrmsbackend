const mongoose = require('mongoose');

/**
 * Training Calendar Model - LMS
 * BRD: BR-P1-005 - Learning Management System
 */
const trainingCalendarSchema = new mongoose.Schema({
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
  trainingName: {
    type: String,
    required: true,
    trim: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  startTime: {
    type: String,
    comment: 'Format: HH:MM',
  },
  endTime: {
    type: String,
    comment: 'Format: HH:MM',
  },
  location: {
    type: String,
    trim: true,
  },
  venue: {
    type: String,
    trim: true,
  },
  mode: {
    type: String,
    enum: ['CLASSROOM', 'ONLINE', 'BLENDED'],
    required: true,
  },
  meetingLink: {
    type: String,
    comment: 'For online training',
  },
  instructor: {
    name: String,
    email: String,
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
  },
  capacity: {
    type: Number,
    required: true,
  },
  enrolled: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'],
    default: 'SCHEDULED',
    index: true,
  },
  registrationDeadline: {
    type: Date,
  },
  isMandatory: {
    type: Boolean,
    default: false,
  },
  targetAudience: {
    departments: [String],
    designations: [String],
    grades: [String],
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

trainingCalendarSchema.index({ tenantId: 1, startDate: 1 });
trainingCalendarSchema.index({ tenantId: 1, courseId: 1, startDate: 1 });
trainingCalendarSchema.index({ tenantId: 1, status: 1 });

trainingCalendarSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('TrainingCalendar', trainingCalendarSchema);
