const mongoose = require('mongoose');

/**
 * Employee Emergency Contact Model
 * BRD Requirement: Separate model for multiple emergency contacts per employee
 */
const employeeEmergencyContactSchema = new mongoose.Schema({
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
  name: {
    type: String,
    required: true,
    trim: true,
  },
  relationship: {
    type: String,
    enum: ['Spouse', 'Parent', 'Sibling', 'Other'],
    required: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: /^[0-9]{10}$/,
    validate: {
      validator: function(value) {
        return /^[0-9]{10}$/.test(value);
      },
      message: 'Phone number must be exactly 10 digits',
    },
  },
  address: {
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
employeeEmergencyContactSchema.index({ tenantId: 1, employeeId: 1 });

employeeEmergencyContactSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('EmployeeEmergencyContact', employeeEmergencyContactSchema);
