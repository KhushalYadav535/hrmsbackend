const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema({
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
  },
  grade: {
    type: String,
    trim: true,
  },
  // Spec C1-03 / BR-C1-14: Default grade mapping for auto-population in Add Employee form
  defaultGradeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grade',
    default: null,
    comment: 'BR-C1-14: If set, Grade auto-populates when this designation is selected',
  },
  // Department tag for categorization
  departmentTag: {
    type: String,
    trim: true,
  },
  level: {
    type: Number,
    default: 1,
    min: 1,
    max: 10,
  },
  minSalary: {
    type: Number,
    default: 0,
  },
  maxSalary: {
    type: Number,
    default: 0,
  },
  description: {
    type: String,
    trim: true,
  },
  // BR-C1-01: Only Active designations shown in dropdown
  // BR-C1-03: Archived designations show (Archived) label on employee profile
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

// Compound index for tenantId and name (unique designation per tenant)
designationSchema.index({ tenantId: 1, name: 1 }, { unique: true });

designationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Designation', designationSchema);
