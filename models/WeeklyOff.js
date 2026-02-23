const mongoose = require('mongoose');

/**
 * Weekly Off Configuration Model
 * BRD: BR-P1-002 - Attendance Enhancements - Weekly Off Configuration
 */
const weeklyOffSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    index: true,
    comment: 'If null, applies to department/location',
  },
  department: {
    type: String,
    trim: true,
    index: true,
    comment: 'If employeeId is null, applies to all in department',
  },
  location: {
    type: String,
    trim: true,
    index: true,
    comment: 'If employeeId and department are null, applies to location',
  },
  offType: {
    type: String,
    enum: ['FIXED', 'ROTATING'],
    required: true,
  },
  fixedDays: [{
    type: Number,
    min: 0,
    max: 6,
    comment: '0=Sunday, 1=Monday, ..., 6=Saturday',
  }],
  rotatingPattern: {
    daysPerWeek: {
      type: Number,
      default: 2,
    },
    rotationCycle: {
      type: Number,
      default: 7,
      comment: 'Days in rotation cycle',
    },
    startDate: {
      type: Date,
    },
  },
  compOffEnabled: {
    type: Boolean,
    default: true,
    comment: 'Enable comp-off if worked on weekly off',
  },
  compOffValidityDays: {
    type: Number,
    default: 30,
    comment: 'Comp-off must be used within X days',
  },
  effectiveDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  endDate: {
    type: Date,
    comment: 'If null, active indefinitely',
  },
  isActive: {
    type: Boolean,
    default: true,
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

weeklyOffSchema.index({ tenantId: 1, employeeId: 1, effectiveDate: 1 });
weeklyOffSchema.index({ tenantId: 1, department: 1, isActive: 1 });
weeklyOffSchema.index({ tenantId: 1, location: 1, isActive: 1 });

weeklyOffSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('WeeklyOff', weeklyOffSchema);
