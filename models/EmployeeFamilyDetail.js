const mongoose = require('mongoose');

/**
 * Employee Family Detail Model
 * BRD Requirement: Track family details for tax and benefits calculation
 */
const employeeFamilyDetailSchema = new mongoose.Schema({
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
    unique: true, // One family detail record per employee
    index: true,
  },
  dependentChildrenCount: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Number of dependent children',
  },
  hasDependentParents: {
    type: Boolean,
    default: false,
    comment: 'Whether employee has dependent parents',
  },
  spouseName: {
    type: String,
    trim: true,
  },
  spouseOccupation: {
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

// Compound indexes
employeeFamilyDetailSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });

employeeFamilyDetailSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('EmployeeFamilyDetail', employeeFamilyDetailSchema);
