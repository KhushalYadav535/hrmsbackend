const mongoose = require('mongoose');

/**
 * Employee Shift Assignment Model
 * BRD: BR-P1-002 - Attendance Enhancements - Shift Management
 */
const employeeShiftSchema = new mongoose.Schema({
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
  shiftId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift',
    required: true,
    index: true,
  },
  effectiveDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  endDate: {
    type: Date,
    comment: 'If null, shift is active indefinitely',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

employeeShiftSchema.index({ tenantId: 1, employeeId: 1, effectiveDate: 1 });
employeeShiftSchema.index({ tenantId: 1, shiftId: 1 });

employeeShiftSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('EmployeeShift', employeeShiftSchema);
