const mongoose = require('mongoose');

/**
 * LoanEmiSchedule Model
 * BRD Requirement: BR-P0-004 - Staff Loans & Advances Module
 * Tracks individual EMI payments for a loan
 */
const loanEmiScheduleSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmployeeLoan',
    required: true,
    index: true,
  },
  emiNumber: {
    type: Number,
    required: true,
    min: 1,
    comment: 'EMI installment number (1, 2, 3, ...)',
  },
  dueDate: {
    type: Date,
    required: true,
    index: true,
    comment: 'Due date for this EMI',
  },
  principalAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Principal component of this EMI',
  },
  interestAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Interest component of this EMI',
  },
  emiAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Total EMI amount (principal + interest)',
  },
  paidDate: {
    type: Date,
    comment: 'Date when EMI was paid',
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Amount actually paid (may differ from emiAmount in case of partial payment)',
  },
  status: {
    type: String,
    enum: ['PENDING', 'PAID', 'OVERDUE', 'WAIVED'],
    default: 'PENDING',
    index: true,
    comment: 'Payment status of this EMI',
  },
  payrollId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payroll',
    comment: 'Reference to payroll record if paid via salary deduction',
  },
  remarks: {
    type: String,
    trim: true,
    comment: 'Remarks for this EMI payment',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound indexes
loanEmiScheduleSchema.index({ tenantId: 1, loanId: 1, emiNumber: 1 }, { unique: true });
loanEmiScheduleSchema.index({ tenantId: 1, loanId: 1, status: 1 });
loanEmiScheduleSchema.index({ tenantId: 1, dueDate: 1, status: 1 }); // For overdue detection
loanEmiScheduleSchema.index({ tenantId: 1, payrollId: 1 });

// Pre-save hook
loanEmiScheduleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Auto-update status based on payment
  if (this.paidDate && this.paidAmount >= this.emiAmount && this.status === 'PENDING') {
    this.status = 'PAID';
  }
  
  // Mark as overdue if due date passed and not paid
  if (!this.paidDate && this.dueDate < new Date() && this.status === 'PENDING') {
    this.status = 'OVERDUE';
  }
  
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('LoanEmiSchedule', loanEmiScheduleSchema);
