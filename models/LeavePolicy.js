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
