const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema({
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
  month: {
    type: String,
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  basicSalary: {
    type: Number,
    required: true,
    default: 0,
  },
  da: {
    type: Number,
    default: 0,
  },
  hra: {
    type: Number,
    default: 0,
  },
  allowances: {
    type: Number,
    default: 0,
  },
  grossSalary: {
    type: Number,
    default: 0,
    comment: 'Gross Salary = Basic + DA + HRA + Allowances',
  },
  pfDeduction: {
    type: Number,
    default: 0,
  },
  employerEPF: {
    type: Number,
    default: 0,
    comment: 'Employer EPF contribution (12% of Basic+DA)',
  },
  esiDeduction: {
    type: Number,
    default: 0,
  },
  employerESI: {
    type: Number,
    default: 0,
    comment: 'Employer ESI contribution (3.25% of Gross if applicable)',
  },
  incomeTax: {
    type: Number,
    default: 0,
  },
  otherDeductions: {
    type: Number,
    default: 0,
  },
  lopDays: {
    type: Number,
    default: 0,
    comment: 'Loss of Pay days from attendance/leave data',
  },
  lopDeduction: {
    type: Number,
    default: 0,
    comment: 'Salary deduction for LOP days',
  },
  loanDeductions: {
    type: Number,
    default: 0,
    comment: 'Total loan deductions',
  },
  arrearsAmount: {
    type: Number,
    default: 0,
    comment: 'Arrears amount if any',
  },
  netSalary: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Processed', 'Paid'],
    default: 'Draft',
    comment: 'Draft -> Submitted -> Approved -> Processed -> Paid',
  },
  // Approval workflow fields
  makerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'Payroll Administrator who created/processed',
  },
  makerName: {
    type: String,
  },
  checkerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'Payroll Administrator who checked/verified',
  },
  checkerName: {
    type: String,
  },
  financeApproverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'Finance Manager who approved for finalization',
  },
  financeApproverName: {
    type: String,
  },
  approvalHistory: [{
    action: {
      type: String,
      enum: ['Submitted', 'Approved', 'Rejected', 'Processed', 'Paid'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    userName: String,
    userRole: String,
    comments: String,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  }],
  submittedDate: {
    type: Date,
  },
  approvedDate: {
    type: Date,
  },
  rejectedDate: {
    type: Date,
  },
  rejectionReason: {
    type: String,
  },
  generatedDate: {
    type: Date,
    default: Date.now,
  },
  paidDate: {
    type: Date,
  },
  payslipUrl: {
    type: String,
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

payrollSchema.index({ tenantId: 1, employeeId: 1, month: 1, year: 1 }, { unique: true });
payrollSchema.index({ tenantId: 1, status: 1 });
payrollSchema.index({ tenantId: 1, makerId: 1, status: 1 });
payrollSchema.index({ tenantId: 1, checkerId: 1, status: 1 });
payrollSchema.index({ tenantId: 1, financeApproverId: 1, status: 1 });

// Update updatedAt before save
payrollSchema.pre('save', function (next) {
  try {
    this.updatedAt = Date.now();
    if (next && typeof next === 'function') {
      next();
    }
  } catch (error) {
    if (next && typeof next === 'function') {
      next(error);
    }
  }
});

module.exports = mongoose.model('Payroll', payrollSchema);
