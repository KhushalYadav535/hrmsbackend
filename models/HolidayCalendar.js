const mongoose = require('mongoose');

/**
 * Holiday Calendar Model
 * BRD: BR-P1-003 - Leave Management Enhancements
 */
const holidayCalendarSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  year: {
    type: Number,
    required: true,
    index: true,
  },
  holidays: [{
    date: {
      type: Date,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['NATIONAL', 'STATE', 'REGIONAL', 'BANK', 'OPTIONAL'],
      default: 'NATIONAL',
    },
    applicableTo: {
      type: String,
      enum: ['ALL', 'DEPARTMENTS', 'LOCATIONS'],
      default: 'ALL',
    },
    applicableDepartments: [String],
    applicableLocations: [String],
    isOptional: {
      type: Boolean,
      default: false,
    },
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

holidayCalendarSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

// Indexes
holidayCalendarSchema.index({ tenantId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('HolidayCalendar', holidayCalendarSchema);
