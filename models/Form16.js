const mongoose = require('mongoose');

/**
 * Form 16 Model
 * BRD Requirement: BR-TAX-010
 * Form 16 certificate generation (Part A & Part B)
 */
const form16Schema = new mongoose.Schema({
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
  financialYear: {
    type: String,
    required: true,
    index: true,
  },
  // Part A - From TRACES
  partA: {
    certificateNumber: String,
    certificateDate: Date,
    pan: String,
    tan: String,
    employerName: String,
    employerAddress: String,
    employeeName: String,
    employeeAddress: String,
    employeePan: String,
    assessmentYear: String,
    // TDS details
    tdsDetails: [{
      quarter: String,
      tdsAmount: Number,
      tdsDeposited: Number,
      challanNumber: String,
      challanDate: Date,
    }],
  },
  // Part B - Tax Computation
  partB: {
    // Salary details
    grossSalary: Number,
    allowances: Number,
    perquisites: Number,
    profitsInLieOfSalary: Number,
    totalSalary: Number,
    // Exemptions
    hraExemption: Number,
    ltaExemption: Number,
    otherExemptions: Number,
    totalExemptions: Number,
    // Deductions
    standardDeduction: Number,
    section80C: Number,
    section80D: Number,
    section80E: Number,
    section80G: Number,
    section80CCD: Number,
    otherDeductions: Number,
    totalDeductions: Number,
    // Tax computation
    taxableIncome: Number,
    taxOnTaxableIncome: Number,
    rebate87A: Number,
    surcharge: Number,
    cess: Number,
    totalTax: Number,
    tdsDeducted: Number,
    taxRefund: Number,
    taxPayable: Number,
    // Month-wise TDS
    monthWiseTds: [{
      month: String,
      tdsAmount: Number,
    }],
  },
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Generated', 'Issued', 'Downloaded'],
    default: 'Draft',
  },
  generatedDate: Date,
  issuedDate: Date,
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  pdfUrl: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

form16Schema.index({ tenantId: 1, employeeId: 1, financialYear: 1 }, { unique: true });
form16Schema.index({ tenantId: 1, financialYear: 1, status: 1 });

form16Schema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Form16', form16Schema);
