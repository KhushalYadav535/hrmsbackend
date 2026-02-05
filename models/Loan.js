const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
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
  loanType: {
    type: String,
    enum: ['Personal Loan', 'Advance Salary', 'Festival Advance', 'Medical Advance', 'Other'],
    required: true,
  },
  loanAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  emiAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Monthly EMI amount',
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  principalPaid: {
    type: Number,
    default: 0,
  },
  principalBalance: {
    type: Number,
    required: true,
  },
  interestRate: {
    type: Number,
    default: 0,
    comment: 'Annual interest rate percentage',
  },
  status: {
    type: String,
    enum: ['Active', 'Closed', 'Suspended'],
    default: 'Active',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedDate: {
    type: Date,
  },
  remarks: {
    type: String,
    trim: true,
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

loanSchema.index({ tenantId: 1, employeeId: 1 });
loanSchema.index({ tenantId: 1, status: 1 });
loanSchema.index({ tenantId: 1, employeeId: 1, status: 1 });

loanSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  // Auto-calculate principal balance
  this.principalBalance = this.loanAmount - (this.principalPaid || 0);
  next();
});

module.exports = mongoose.model('Loan', loanSchema);
