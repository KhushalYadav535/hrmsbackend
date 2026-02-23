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
    comment: 'Reporting manager (Employee reference)',
  },
  // BRD Requirement: Organization unit posting
  postingUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrganizationUnit',
    index: true,
    comment: 'Organizational unit where employee is posted (HO/ZO/RO/Branch)',
  },
  location: {
    type: String,
    required: true,
    comment: 'Location (can be derived from postingUnitId, kept for backward compatibility)',
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
    match: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
    sparse: true,
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
      // Validate PAN format before encryption
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value)) {
        throw new Error('Invalid PAN format. Must be 5 letters, 4 digits, 1 letter (e.g., ABCDE1234F)');
      }
      return encrypt(value);
    },
  },
  aadhaarNumber: {
    type: String,
    trim: true,
    minlength: 12,
    maxlength: 12,
    match: /^[0-9]{12}$/,
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
      // Validate Aadhaar format (12 digits only)
      const digitsOnly = value.replace(/\D/g, '');
      if (digitsOnly.length !== 12) {
        throw new Error('Invalid Aadhaar format. Must be exactly 12 digits.');
      }
      return encrypt(digitsOnly);
    },
  },
  uanNumber: {
    type: String,
    trim: true,
    minlength: 12,
    maxlength: 12,
    match: /^[0-9]{12}$/,
    comment: 'Universal Account Number (EPF) - 12 digits',
  },
  // DEPRECATED: bankAccount and ifscCode moved to EmployeeBankAccount model
  // Keeping for backward compatibility during migration
  bankAccount: {
    type: String,
    trim: true,
    select: false, // Hide by default - use EmployeeBankAccount model instead
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
    select: false, // Hide by default - use EmployeeBankAccount model instead
  },
  address: {
    type: String,
    trim: true,
  },
  // DEPRECATED: emergencyContact and emergencyPhone moved to EmployeeEmergencyContact model
  // Keeping for backward compatibility during migration
  emergencyContact: {
    type: String,
    trim: true,
    select: false, // Hide by default - use EmployeeEmergencyContact model instead
  },
  emergencyPhone: {
    type: String,
    trim: true,
    select: false, // Hide by default - use EmployeeEmergencyContact model instead
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
    trim: true,
  },
  maritalStatus: {
    type: String,
    enum: ['Single', 'Married', 'Divorced', 'Widowed'],
    trim: true,
  },
  passportNumber: {
    type: String,
    trim: true,
    uppercase: true,
    sparse: true,
    comment: 'Optional passport number',
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
employeeSchema.index({ tenantId: 1, panNumber: 1 }, { unique: true, sparse: true }); // PAN unique per tenant
employeeSchema.index({ tenantId: 1, postingUnitId: 1 }); // Index for organization unit queries

employeeSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Employee', employeeSchema);
