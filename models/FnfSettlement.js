const mongoose = require('mongoose');

/**
 * FnfSettlement Model (Full & Final Settlement)
 * Calculates and tracks final settlement for separated employees
 * BRD: BR-P0-005 - F&F Settlement
 * Business Logic: HRMS-PAY-005
 */
const fnfSettlementSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  separationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmployeeSeparation',
    required: true,
    unique: true,
    index: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  
  // ========== EARNINGS ==========
  salaryDaysPayable: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Number of days worked in last month',
  },
  basicPerDay: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Basic salary per day (Basic / 26)',
  },
  salaryAmount: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Salary for partial month = (Gross / 26) × daysWorked',
  },
  
  leaveEncashmentDays: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Eligible leave days for encashment (max 30 as per bank policy)',
  },
  leaveEncashmentAmount: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Leave encashment = (Basic + DA) / 26 × eligibleLeaveDays',
  },
  
  gratuityAmount: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Gratuity = (Basic + DA) × 15/26 × completedYearsOfService (max ₹20L)',
  },
  gratuityYears: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Completed years of service used for gratuity calculation',
  },
  
  bonusAmount: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Pending/pro-rated bonus',
  },
  
  pfContributionAmount: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Employee PF contribution refund (if applicable)',
  },
  
  noticePeriodRecoveryDays: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Shortfall in notice period (if any)',
  },
  noticePeriodRecoveryAmount: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Notice period recovery = (Gross / 30) × shortfallDays',
  },
  
  loanOutstandingRecovery: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Total outstanding loan amount to be recovered',
  },
  
  otherDeductions: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Other deductions (advances, etc.)',
  },
  
  totalEarnings: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Sum of all earnings',
  },
  totalDeductions: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Sum of all deductions',
  },
  netPayable: {
    type: Number,
    default: 0,
    comment: 'Net amount payable to employee (can be negative if deductions exceed earnings)',
  },
  
  status: {
    type: String,
    enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID'],
    default: 'DRAFT',
    index: true,
  },
  
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'User who approved the F&F settlement',
  },
  approvedDate: {
    type: Date,
  },
  
  paidDate: {
    type: Date,
    comment: 'Date when payment was made (must be within 7 days of last working day)',
  },
  
  paymentMode: {
    type: String,
    enum: ['NEFT', 'RTGS', 'CHEQUE', 'CASH'],
    comment: 'Mode of payment',
  },
  
  paymentReference: {
    type: String,
    comment: 'Payment reference number/UTR',
  },
  
  remarks: {
    type: String,
    comment: 'Additional remarks/notes',
  },
  
  // Calculation metadata (for audit)
  calculationMetadata: {
    lastSalaryMonth: String,
    lastSalaryYear: Number,
    serviceYears: Number,
    serviceDays: Number,
    basicSalary: Number,
    daAmount: Number,
    grossSalary: Number,
    calculatedAt: Date,
    calculatedBy: mongoose.Schema.Types.ObjectId,
  },
}, {
  timestamps: true,
});

// Indexes
fnfSettlementSchema.index({ tenantId: 1, employeeId: 1 });
fnfSettlementSchema.index({ tenantId: 1, status: 1 });
fnfSettlementSchema.index({ tenantId: 1, paidDate: 1 });

// Virtual: Check if payment is overdue (must be within 7 days of last working day)
fnfSettlementSchema.virtual('isPaymentOverdue').get(function() {
  if (!this.paidDate) {
    const separation = mongoose.model('EmployeeSeparation').findById(this.separationId);
    if (separation && separation.lastWorkingDate) {
      const lwd = new Date(separation.lastWorkingDate);
      const dueDate = new Date(lwd);
      dueDate.setDate(dueDate.getDate() + 7);
      return new Date() > dueDate;
    }
  }
  return false;
});

// Pre-save hook: Auto-calculate totals
fnfSettlementSchema.pre('save', function(next) {
  // Calculate total earnings
  this.totalEarnings = Math.round(
    this.salaryAmount +
    this.leaveEncashmentAmount +
    this.gratuityAmount +
    this.bonusAmount +
    this.pfContributionAmount
  );

  // Calculate total deductions
  this.totalDeductions = Math.round(
    this.noticePeriodRecoveryAmount +
    this.loanOutstandingRecovery +
    this.otherDeductions
  );

  // Calculate net payable
  this.netPayable = this.totalEarnings - this.totalDeductions;

  next();
});

module.exports = mongoose.model('FnfSettlement', fnfSettlementSchema);
