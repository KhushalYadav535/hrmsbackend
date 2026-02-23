const mongoose = require('mongoose');

/**
 * EmployeeSeparation Model
 * Tracks employee exit/resignation/retirement process
 * BRD: BR-P0-005 - Exit Management & F&F Settlement
 */
const employeeSeparationSchema = new mongoose.Schema({
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
  separationType: {
    type: String,
    enum: ['RESIGNATION', 'RETIREMENT', 'TERMINATION', 'VRS', 'DEATH_IN_SERVICE', 'ABSCONDING'],
    required: true,
    index: true,
  },
  resignationDate: {
    type: Date,
    required: function() {
      return this.separationType === 'RESIGNATION';
    },
  },
  lastWorkingDate: {
    type: Date,
    required: true,
    index: true,
  },
  noticePeriodDays: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Required notice period in days based on grade/designation',
  },
  noticePeriodServedDays: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Actual notice period served',
  },
  noticePeriodWaived: {
    type: Boolean,
    default: false,
    comment: 'Whether notice period was waived by management',
  },
  resignationReason: {
    type: String,
    comment: 'Reason for resignation (free text)',
  },
  resignationLetterUrl: {
    type: String,
    comment: 'Uploaded resignation letter PDF URL',
  },
  hrRemarks: {
    type: String,
    comment: 'HR remarks/notes on separation',
  },
  exitInterviewConducted: {
    type: Boolean,
    default: false,
  },
  exitInterviewNotes: {
    type: String,
    comment: 'Exit interview feedback and notes',
  },
  status: {
    type: String,
    enum: [
      'SUBMITTED',
      'ACCEPTED',
      'NOTICE_PERIOD',
      'CLEARANCE_PENDING',
      'CLEARANCE_DONE',
      'FNF_PENDING',
      'FNF_APPROVED',
      'COMPLETED',
    ],
    default: 'SUBMITTED',
    index: true,
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'User who submitted the resignation (usually employee)',
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'Manager/HR who accepted the resignation',
  },
  acceptedDate: {
    type: Date,
  },
  completedDate: {
    type: Date,
    comment: 'Date when exit process was fully completed',
  },
}, {
  timestamps: true,
});

// Indexes
employeeSeparationSchema.index({ tenantId: 1, employeeId: 1 });
employeeSeparationSchema.index({ tenantId: 1, status: 1 });
employeeSeparationSchema.index({ tenantId: 1, lastWorkingDate: 1 });

// Virtual: Calculate notice period shortfall
employeeSeparationSchema.virtual('noticePeriodShortfall').get(function() {
  if (this.noticePeriodWaived) return 0;
  const shortfall = this.noticePeriodDays - this.noticePeriodServedDays;
  return Math.max(0, shortfall);
});

// Pre-save hook: Auto-update status based on dates
employeeSeparationSchema.pre('save', function(next) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lwd = new Date(this.lastWorkingDate);
  lwd.setHours(0, 0, 0, 0);

  // If last working date has passed and status is still NOTICE_PERIOD
  if (lwd < today && this.status === 'NOTICE_PERIOD') {
    this.status = 'CLEARANCE_PENDING';
  }

  // Calculate notice period served days
  if (this.resignationDate && this.lastWorkingDate) {
    const diffTime = Math.abs(lwd.getTime() - new Date(this.resignationDate).getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    this.noticePeriodServedDays = Math.min(diffDays, this.noticePeriodDays);
  }

  next();
});

module.exports = mongoose.model('EmployeeSeparation', employeeSeparationSchema);
