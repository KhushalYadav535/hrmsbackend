const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema({
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
  },
  financialYear: {
    type: Number,
    required: true,
    comment: 'Financial year (e.g., 2024 for FY 2024-25)',
  },
  openingBalance: {
    type: Number,
    default: 0,
    comment: 'Balance at start of financial year (carry-forward)',
  },
  accrued: {
    type: Number,
    default: 0,
    comment: 'Leaves accrued during the year',
  },
  used: {
    type: Number,
    default: 0,
    comment: 'Leaves used/applied',
  },
  currentBalance: {
    type: Number,
    default: 0,
    comment: 'Current available balance (opening + accrued - used)',
  },
  maxBalance: {
    type: Number,
    default: 0,
    comment: 'Maximum balance allowed (for carry-forward limits)',
  },
  lastAccrualDate: {
    type: Date,
    comment: 'Last date when leaves were accrued',
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

// Compound index for unique leave balance per employee, leave type, and financial year
leaveBalanceSchema.index({ tenantId: 1, employeeId: 1, leaveType: 1, financialYear: 1 }, { unique: true });
leaveBalanceSchema.index({ tenantId: 1, financialYear: 1 });

leaveBalanceSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  // Auto-calculate current balance
  this.currentBalance = this.openingBalance + this.accrued - this.used;
  next();
});

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);
