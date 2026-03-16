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
  // Spec C1-01: Designation as FK reference to Designation Master (BR-C1-02)
  // Searchable dropdown from Designation Master — no free-text
  designation: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    comment: 'BR-C1-02: Designation stored as FK reference. Accepts ObjectId or legacy String.',
  },
  // Spec C1-03: Grade field (BR-C1-12: mandatory)
  // Auto-fills from Designation mapping if exists (BR-C1-14)
  grade: {
    type: mongoose.Schema.Types.Mixed,
    comment: 'BR-C1-12: Grade is mandatory. FK reference to Grade Master or legacy String.',
  },
  // BR-C1-15: Track grade changes with effective dates
  gradeHistory: [{
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade' },
    gradeName: { type: String },
    effectiveDate: { type: Date, required: true },
    reason: { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  }],
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
  // Spec C1-02: Location as FK reference to Location Master (BR-C1-07)
  location: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    comment: 'BR-C1-07: Location stored as FK reference. Accepts ObjectId or legacy String.',
  },
  // BR-C1-11: Track location transfers as events with effective dates
  locationHistory: [{
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
    locationName: { type: String },
    effectiveDate: { type: Date, required: true },
    reason: { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  }],
  // BR-ORG-02: Track organization unit transfers as history events
  transferHistory: [{
    fromUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrganizationUnit' },
    toUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrganizationUnit' },
    effectiveDate: { type: Date, required: true },
    transferId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeTransfer' },
    transferType: { type: String, enum: ['Permanent', 'Temporary', 'Deputation'] },
    reason: { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  }],
  // Employment type per spec E3
  employmentType: {
    type: String,
    enum: ['Permanent', 'Contract', 'Probation', 'Internship'],
    default: 'Permanent',
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
  bankAccount: {
    type: String,
    trim: true,
    select: false,
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
    select: false,
  },
  address: {
    type: String,
    trim: true,
  },
  // DEPRECATED: emergencyContact and emergencyPhone moved to EmployeeEmergencyContact model
  emergencyContact: {
    type: String,
    trim: true,
    select: false,
  },
  emergencyPhone: {
    type: String,
    trim: true,
    select: false,
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
employeeSchema.index({ tenantId: 1, panNumber: 1 }, { unique: true, sparse: true });
employeeSchema.index({ tenantId: 1, postingUnitId: 1 });

employeeSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Employee', employeeSchema);
