const mongoose = require('mongoose');

/**
 * Holiday Calendar Model
 * BRD Requirement: Sandwich leave policy applies to leaves between holidays
 * Tracks holidays for sandwich leave detection
 */
const holidayCalendarSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  holidayDate: {
    type: Date,
    required: true,
    comment: 'Date of the holiday',
  },
  holidayName: {
    type: String,
    required: true,
    trim: true,
    comment: 'Name of the holiday',
  },
  holidayType: {
    type: String,
    enum: ['National', 'Regional', 'Bank Holiday', 'Festival', 'Other'],
    default: 'National',
  },
  isRecurring: {
    type: Boolean,
    default: false,
    comment: 'Whether this holiday repeats annually',
  },
  recurringMonth: {
    type: Number,
    min: 0,
    max: 11,
    comment: 'Month (0-11) for recurring holidays',
  },
  recurringDay: {
    type: Number,
    min: 1,
    max: 31,
    comment: 'Day of month for recurring holidays',
  },
  applicableLocations: [{
    type: String,
    trim: true,
    comment: 'Locations where this holiday applies (empty = all locations)',
  }],
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

// Indexes
holidayCalendarSchema.index({ tenantId: 1, holidayDate: 1 });
holidayCalendarSchema.index({ tenantId: 1, holidayDate: 1, holidayType: 1 });
holidayCalendarSchema.index({ tenantId: 1, isRecurring: 1 });

holidayCalendarSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('HolidayCalendar', holidayCalendarSchema);
