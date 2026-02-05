const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

const employeeSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  employeeCode: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  dateOfBirth: {
    type: Date,
    required: true,
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'On Leave', 'Retired'],
    default: 'Active',
  },
  joinDate: {
    type: Date,
    required: true,
  },
  designation: {
    type: String,
    required: true,
    trim: true,
  },
  department: {
    type: String,
    required: true,
    trim: true,
  },
  reportingManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  location: {
    type: String,
    required: true,
  },
  salary: {
    type: Number,
    required: true,
  },
  ctc: {
    type: Number,
    required: true,
  },
  pfNumber: {
    type: String,
    trim: true,
  },
  esiNumber: {
    type: String,
    trim: true,
  },
  panNumber: {
    type: String,
    trim: true,
    uppercase: true,
    // BRD Requirement: Field-level encryption for sensitive data
    get: function(value) {
      if (!value) return value;
      try {
        return decrypt(value);
      } catch {
        return value; // Return as-is if decryption fails (for backward compatibility)
      }
    },
    set: function(value) {
      if (!value) return value;
      return encrypt(value);
    },
  },
  aadhaarNumber: {
    type: String,
    trim: true,
    // BRD Requirement: Field-level encryption for sensitive data
    get: function(value) {
      if (!value) return value;
      try {
        return decrypt(value);
      } catch {
        return value;
      }
    },
    set: function(value) {
      if (!value) return value;
      return encrypt(value);
    },
  },
  bankAccount: {
    type: String,
    trim: true,
    // BRD Requirement: Field-level encryption for sensitive data
    get: function(value) {
      if (!value) return value;
      try {
        return decrypt(value);
      } catch {
        return value;
      }
    },
    set: function(value) {
      if (!value) return value;
      return encrypt(value);
    },
  },
  ifscCode: {
    type: String,
    trim: true,
    uppercase: true,
  },
  address: {
    type: String,
    trim: true,
  },
  emergencyContact: {
    type: String,
    trim: true,
  },
  emergencyPhone: {
    type: String,
    trim: true,
  },
  bloodGroup: {
    type: String,
    trim: true,
  },
  documents: [
    {
      name: String,
      type: String,
      url: String,
      uploadedDate: { type: Date, default: Date.now },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

employeeSchema.index({ tenantId: 1, employeeCode: 1 }, { unique: true });
employeeSchema.index({ tenantId: 1, email: 1 }, { unique: true });

employeeSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Employee', employeeSchema);
