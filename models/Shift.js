const mongoose = require('mongoose');

/**
 * Shift Model
 * BRD: BR-P1-002 - Attendance Enhancements - Shift Management
 */
const shiftSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  shiftCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  shiftName: {
    type: String,
    required: true,
    trim: true,
  },
  shiftType: {
    type: String,
    enum: ['GENERAL', 'MORNING', 'EVENING', 'NIGHT', 'FLEXIBLE'],
    required: true,
  },
  startTime: {
    type: String,
    required: true,
    comment: 'Format: HH:MM (24-hour)',
  },
  endTime: {
    type: String,
    required: true,
    comment: 'Format: HH:MM (24-hour)',
  },
  gracePeriod: {
    type: Number,
    default: 15,
    comment: 'Grace period in minutes',
  },
  halfDayCutoff: {
    type: String,
    comment: 'Half-day cutoff time (HH:MM)',
  },
  totalHours: {
    type: Number,
    required: true,
    default: 8,
    comment: 'Total working hours',
  },
  breakDuration: {
    type: Number,
    default: 60,
    comment: 'Break duration in minutes',
  },
  nightShiftAllowance: {
    type: Number,
    default: 0,
    comment: 'Night shift allowance per day (₹)',
  },
  // Flexible shift specific
  flexibleShift: {
    minHours: {
      type: Number,
      default: 8,
    },
    coreHoursStart: {
      type: String,
      comment: 'Core hours start (HH:MM)',
    },
    coreHoursEnd: {
      type: String,
      comment: 'Core hours end (HH:MM)',
    },
    flexibleStartWindow: {
      start: String,
      end: String,
    },
    flexibleEndWindow: {
      start: String,
      end: String,
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  description: {
    type: String,
    trim: true,
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

shiftSchema.index({ tenantId: 1, shiftCode: 1 }, { unique: true });
shiftSchema.index({ tenantId: 1, isActive: 1 });

shiftSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Shift', shiftSchema);
