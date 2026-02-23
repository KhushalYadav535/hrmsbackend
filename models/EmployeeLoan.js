const mongoose = require('mongoose');

/**
 * EmployeeLoan Model
 * BRD Requirement: BR-P0-004 - Staff Loans & Advances Module
 * Enhanced loan model with multi-level approval workflow
 */
const employeeLoanSchema = new mongoose.Schema({
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
  loanTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanType',
    required: true,
    index: true,
    comment: 'Reference to LoanType master data',
  },
  appliedAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Amount requested by employee',
  },
  sanctionedAmount: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Amount sanctioned by Finance (may be less than applied)',
  },
  interestRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    comment: 'Annual interest rate percentage (from LoanType or adjusted)',
  },
  tenureMonths: {
    type: Number,
    required: true,
    min: 1,
    comment: 'Loan tenure in months',
  },
  emiAmount: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Monthly EMI amount (calculated)',
  },
  outstandingAmount: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Current outstanding amount (principal + interest)',
  },
  status: {
    type: String,
    enum: [
      'APPLIED',
      'MANAGER_APPROVED',
      'HR_VERIFIED',
      'FINANCE_SANCTIONED',
      'DISBURSED',
      'ACTIVE',
      'CLOSED',
      'REJECTED',
    ],
    default: 'APPLIED',
    index: true,
    comment: 'Current status in approval/repayment workflow',
  },
  disbursalDate: {
    type: Date,
    comment: 'Date when loan was disbursed',
  },
  closureDate: {
    type: Date,
    comment: 'Date when loan was closed/fully repaid',
  },
  remarks: {
    type: String,
    trim: true,
    comment: 'General remarks or notes',
  },
  // Document references (optional - can be stored separately)
  supportingDocuments: [{
    documentType: String,
    documentUrl: String,
    uploadedDate: Date,
  }],
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
employeeLoanSchema.index({ tenantId: 1, employeeId: 1 });
employeeLoanSchema.index({ tenantId: 1, status: 1 });
employeeLoanSchema.index({ tenantId: 1, employeeId: 1, status: 1 });
employeeLoanSchema.index({ tenantId: 1, loanTypeId: 1 });
employeeLoanSchema.index({ tenantId: 1, status: 1, createdAt: -1 }); // For approval queue

// Pre-save hook
employeeLoanSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Auto-set disbursalDate when status changes to DISBURSED
  if (this.isModified('status') && this.status === 'DISBURSED' && !this.disbursalDate) {
    this.disbursalDate = new Date();
    // Initialize outstandingAmount to sanctionedAmount when disbursed
    if (this.outstandingAmount === 0 && this.sanctionedAmount > 0) {
      this.outstandingAmount = this.sanctionedAmount;
    }
  }
  
  // Auto-set closureDate when status changes to CLOSED
  if (this.isModified('status') && this.status === 'CLOSED' && !this.closureDate) {
    this.closureDate = new Date();
    this.outstandingAmount = 0;
  }
  
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('EmployeeLoan', employeeLoanSchema);
