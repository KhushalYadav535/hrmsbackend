const mongoose = require('mongoose');

/**
 * Shift Assignment Model
 * BRD: BR-P1-002 - Attendance Enhancements
 */
const shiftAssignmentSchema = new mongoose.Schema({
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
  shiftId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift',
    required: true,
    index: true,
  },
  effectiveDate: {
    type: Date,
    required: true,
    index: true,
  },
  endDate: {
    type: Date,
  },
  weeklyOff: {
    type: [Number],
    default: [0],
    comment: '0=Sunday, 1=Monday, ..., 6=Saturday',
  },
  rotationType: {
    type: String,
    enum: ['FIXED', 'WEEKLY', 'MONTHLY'],
    default: 'FIXED',
  },
  rotationSchedule: [{
    week: Number,
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
    },
  }],
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

shiftAssignmentSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
shiftAssignmentSchema.index({ tenantId: 1, employeeId: 1, effectiveDate: 1 });
shiftAssignmentSchema.index({ tenantId: 1, shiftId: 1 });

module.exports = mongoose.model('ShiftAssignment', shiftAssignmentSchema);
