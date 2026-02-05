const mongoose = require('mongoose');

/**
 * Tax Computation Model
 * BRD Requirement: BR-TAX-004, BR-TAX-009, BR-TAX-012
 * Monthly TDS calculation and tax computation sheet
 */
const taxComputationSchema = new mongoose.Schema({
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
  regime: {
    type: String,
    enum: ['Old', 'New'],
    required: true,
  },
  // Month-wise computation
  monthlyComputations: [{
    month: {
      type: String,
      required: true,
      enum: ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'],
    },
    year: Number, // e.g., 2025
    // Income components
    basicSalary: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    arrears: { type: Number, default: 0 },
    otherIncome: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },
    // Exemptions
    hraExemption: { type: Number, default: 0 },
    ltaExemption: { type: Number, default: 0 },
    standardDeduction: { type: Number, default: 50000 },
    // Deductions (declared investments)
    section80C: { type: Number, default: 0 },
    section80D: { type: Number, default: 0 },
    section80E: { type: Number, default: 0 },
    section80G: { type: Number, default: 0 },
    section80CCD: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    // Tax calculation
    taxableIncome: { type: Number, default: 0 },
    projectedAnnualIncome: { type: Number, default: 0 },
    projectedAnnualTax: { type: Number, default: 0 },
    tdsDeducted: { type: Number, default: 0 },
    // Cumulative
    cumulativeTaxableIncome: { type: Number, default: 0 },
    cumulativeTdsDeducted: { type: Number, default: 0 },
  }],
  // Previous employer income
  previousEmployerIncome: {
    type: Number,
    default: 0,
  },
  previousEmployerTds: {
    type: Number,
    default: 0,
  },
  // Annual totals
  annualGrossSalary: { type: Number, default: 0 },
  annualExemptions: { type: Number, default: 0 },
  annualDeductions: { type: Number, default: 0 },
  annualTaxableIncome: { type: Number, default: 0 },
  annualTax: { type: Number, default: 0 },
  annualCess: { type: Number, default: 0 },
  annualTotalTax: { type: Number, default: 0 },
  annualTdsDeducted: { type: Number, default: 0 },
  taxRefund: { type: Number, default: 0 },
  taxPayable: { type: Number, default: 0 },
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Active', 'Finalized'],
    default: 'Draft',
  },
  finalizedDate: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

taxComputationSchema.index({ tenantId: 1, employeeId: 1, financialYear: 1 }, { unique: true });
taxComputationSchema.index({ tenantId: 1, financialYear: 1 });

taxComputationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('TaxComputation', taxComputationSchema);
