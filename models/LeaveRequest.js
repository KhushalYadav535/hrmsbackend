const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
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
  leaveType: {
    type: String,
    required: true,
    trim: true,
    // Removed enum to allow dynamic leave types from LeavePolicy
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  days: {
    type: Number,
    required: true,
    comment: 'Number of days (can be 0.5 for half-day)',
  },
  isHalfDay: {
    type: Boolean,
    default: false,
    comment: 'BRD: BR-P1-003 - Half-day leave support',
  },
  halfDayType: {
    type: String,
    enum: ['FIRST_HALF', 'SECOND_HALF'],
    comment: 'BRD: BR-P1-003 - First half (morning) or Second half (afternoon)',
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
    default: 'Pending',
  },
  appliedDate: {
    type: Date,
    default: Date.now,
  },
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approverName: {
    type: String,
  },
  comments: {
    type: String,
    trim: true,
  },
  // BRD Requirement: Medical certificate for sick leave > 3 days
  medicalCertificate: {
    name: String,
    url: String,
    uploadedDate: Date,
    verified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verifiedDate: Date,
  },
  // BRD Requirement: Sandwich leave detection
  isSandwichLeave: {
    type: Boolean,
    default: false,
    comment: 'Leave between holidays/weekends',
  },
  sandwichLeaveDetails: {
    previousHoliday: Date,
    nextHoliday: Date,
    detectedDate: Date,
  },
  // Supporting documents
  attachments: [{
    name: String,
    url: String,
    uploadedDate: { type: Date, default: Date.now },
  }],
  // Leave cancellation
  cancelledDate: Date,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  cancellationReason: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

leaveRequestSchema.index({ tenantId: 1, employeeId: 1 });
leaveRequestSchema.index({ tenantId: 1, status: 1 });
leaveRequestSchema.index({ tenantId: 1, approverId: 1, status: 1 });

// Update updatedAt before save
leaveRequestSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
