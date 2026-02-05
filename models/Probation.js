const mongoose = require('mongoose');

/**
 * Probation Model
 * BRD Requirement: BR-ONB-009
 * Probation period management with reminder alerts
 */
const probationSchema = new mongoose.Schema({
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
  onboardingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Onboarding',
  },
  // Probation details
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  duration: {
    type: Number,
    required: true,
    default: 6, // months
  },
  // Status
  status: {
    type: String,
    enum: ['Active', 'Extended', 'Confirmed', 'Terminated'],
    default: 'Active',
  },
  // Confirmation details
  confirmedDate: Date,
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  confirmationLetterUrl: String,
  // Extension details
  extendedDate: Date,
  extendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  extensionReason: String,
  newEndDate: Date,
  // Performance reviews during probation
  reviews: [{
    reviewDate: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    rating: {
      type: String,
      enum: ['Excellent', 'Good', 'Satisfactory', 'Needs Improvement', 'Unsatisfactory'],
    },
    comments: String,
    recommendation: {
      type: String,
      enum: ['Confirm', 'Extend', 'Terminate'],
    },
  }],
  // Reminders
  remindersSent: [{
    type: {
      type: String,
      enum: ['30 Days Before', '15 Days Before', '7 Days Before', 'On End Date', 'Overdue'],
    },
    sentDate: Date,
    sentTo: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
  }],
  // Termination
  terminatedDate: Date,
  terminatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  terminationReason: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

probationSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });
probationSchema.index({ tenantId: 1, status: 1 });
probationSchema.index({ tenantId: 1, endDate: 1 });

probationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Calculate end date if not provided
  if (!this.endDate && this.startDate && this.duration) {
    const endDate = new Date(this.startDate);
    endDate.setMonth(endDate.getMonth() + this.duration);
    this.endDate = endDate;
  }
  
  // Check if probation is overdue
  if (this.status === 'Active' && this.endDate < new Date()) {
    // Don't auto-change status, but can be checked in queries
  }
  
  next();
});

module.exports = mongoose.model('Probation', probationSchema);
