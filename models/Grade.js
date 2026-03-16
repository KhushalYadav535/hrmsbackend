const mongoose = require('mongoose');

/**
 * Grade Master
 * Spec C1-03: Grade field in Add Employee form populated from this master.
 * BR-C1-12: Grade is mandatory for all employee records.
 * BR-C1-13: Grade drives payroll scale/band, leave tier, loan eligibility, benefit tier, travel class.
 * BR-C1-14: If Designation→Grade mapping exists, Grade auto-populates from Designation.
 */
const gradeSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 50,
  },
  level: {
    type: Number,
    default: 1,
    min: 1,
    max: 20,
  },
  // BR-C1-13: Payroll band/scale linked to this grade
  payrollBand: {
    type: String,
    trim: true,
  },
  minSalary: {
    type: Number,
    default: 0,
  },
  maxSalary: {
    type: Number,
    default: 0,
  },
  // Leave entitlement tier
  leaveTier: {
    type: String,
    trim: true,
  },
  // Travel class entitlement
  travelClass: {
    type: String,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  // BR-C1-16: Archived Grade not shown in dropdown
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Archived'],
    default: 'Active',
    index: true,
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

gradeSchema.index({ tenantId: 1, name: 1 }, { unique: true });

gradeSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Grade', gradeSchema);
