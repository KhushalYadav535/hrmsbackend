const mongoose = require('mongoose');

/**
 * Employee Previous Employment Model
 * BRD Requirement: Track previous employment history with documents
 */
const employeePreviousEmploymentSchema = new mongoose.Schema({
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
  employerName: {
    type: String,
    required: true,
    trim: true,
  },
  employerAddress: {
    type: String,
    trim: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(value) {
        return !this.startDate || value >= this.startDate;
      },
      message: 'End date must be after start date',
    },
  },
  relievingLetterUrl: {
    type: String,
    trim: true,
    comment: 'URL to uploaded relieving letter document',
  },
  experienceCertUrl: {
    type: String,
    trim: true,
    comment: 'URL to uploaded experience certificate document',
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
employeePreviousEmploymentSchema.index({ tenantId: 1, employeeId: 1 });
employeePreviousEmploymentSchema.index({ tenantId: 1, employeeId: 1, startDate: -1 });

employeePreviousEmploymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('EmployeePreviousEmployment', employeePreviousEmploymentSchema);
