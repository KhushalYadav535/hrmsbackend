const mongoose = require('mongoose');

const leavePolicySchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  leaveType: {
    type: String,
    required: true,
    trim: true,
  },
  daysPerYear: {
    type: Number,
    required: true,
    min: 0,
  },
  // BRD: Grade-wise leave quotas — different limits for officers/clerks/sub-staff
  gradeWiseQuotas: [
    {
      grade: { type: String, required: true }, // e.g., 'Officer', 'Clerk', 'Sub-Staff', 'JMG Scale I', etc.
      daysPerYear: { type: Number, required: true, min: 0 },
      maxAccrual: { type: Number, default: 0 }, // 0 = no limit
      maxCarryForward: { type: Number, default: 0 },
    },
  ],
  // BRD: Maximum accrual cap (total leave balance cannot exceed this)
  maxAccrualLimit: {
    type: Number,
    default: 0,
    comment: '0 = no limit. Total balance cap across all accruals.',
  },
  // BRD: Medical certificate required for SL > N days
  requiresMedicalCertificate: {
    type: Boolean,
    default: false,
  },
  medicalCertificateAfterDays: {
    type: Number,
    default: 3,
    comment: 'Medical certificate required if sick leave > this many days',
  },
  // BRD: Minimum notice period before applying (0 = no restriction)
  minNoticeDays: {
    type: Number,
    default: 0,
  },
  // BRD: Minimum and maximum duration per single application
  minLeaveDuration: {
    type: Number,
    default: 0.5, // half day
  },
  maxLeaveDuration: {
    type: Number,
    default: 0, // 0 = no limit
  },
  // BRD: Allow half-day leaves
  allowHalfDay: {
    type: Boolean,
    default: false,
  },
  // BRD: Probation restriction
  restrictedDuringProbation: {
    type: Boolean,
    default: false,
  },
  // BRD: Flexi-holiday (employee can choose from a list of optional holidays)
  isFlexiHoliday: {
    type: Boolean,
    default: false,
  },
  flexiHolidayLimit: {
    type: Number,
    default: 0,
    comment: 'Max number of optional holidays employee can choose in a year',
  },
  accrualFrequency: {
    type: String,
    enum: ['Monthly', 'Quarterly', 'Yearly', 'None'],
    default: 'Monthly',
    comment: 'How often leaves are accrued: Monthly, Quarterly, Yearly, or None',
  },
  accrualRate: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Number of days accrued per accrual period (e.g., 1 day per month)',
  },
  accrualDate: {
    type: Number,
    default: 1,
    min: 1,
    max: 31,
    comment: 'Day of month when accrual happens (1-31, default: 1st)',
  },
  carryForward: {
    type: Boolean,
    default: false,
  },
  maxCarryForward: {
    type: Number,
    default: 0,
  },
  requiresApproval: {
    type: Boolean,
    default: true,
  },
  description: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
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

leavePolicySchema.index({ tenantId: 1, leaveType: 1 }, { unique: true });

leavePolicySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('LeavePolicy', leavePolicySchema);
