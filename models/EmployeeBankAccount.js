const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

/**
 * Employee Bank Account Model
 * BRD Requirement: Separate model for multiple bank accounts per employee
 * Supports primary account designation and encrypted account numbers
 */
const employeeBankAccountSchema = new mongoose.Schema({
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
  bankName: {
    type: String,
    required: true,
    trim: true,
  },
  branchName: {
    type: String,
    required: true,
    trim: true,
  },
  accountNumber: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(value) {
        // Account number: 9-18 digits
        const digitsOnly = value.replace(/\D/g, '');
        return digitsOnly.length >= 9 && digitsOnly.length <= 18;
      },
      message: 'Account number must be between 9 and 18 digits',
    },
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
      // Validate account number format (9-18 digits)
      const digitsOnly = value.replace(/\D/g, '');
      if (digitsOnly.length < 9 || digitsOnly.length > 18) {
        throw new Error('Account number must be between 9 and 18 digits');
      }
      return encrypt(digitsOnly);
    },
  },
  ifscCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: /^[A-Z]{4}0[A-Z0-9]{6}$/,
    validate: {
      validator: function(value) {
        return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value);
      },
      message: 'Invalid IFSC code format. Must be 4 letters, 0, then 6 alphanumeric (e.g., HDFC0001234)',
    },
  },
  accountType: {
    type: String,
    enum: ['Savings', 'Current'],
    required: true,
  },
  accountHolderName: {
    type: String,
    required: true,
    trim: true,
  },
  isPrimary: {
    type: Boolean,
    default: false,
    comment: 'Primary account for salary credits',
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
employeeBankAccountSchema.index({ tenantId: 1, employeeId: 1 });
employeeBankAccountSchema.index({ tenantId: 1, employeeId: 1, isPrimary: 1 });

// Ensure only one primary account per employee
employeeBankAccountSchema.pre('save', async function(next) {
  if (this.isPrimary && this.isModified('isPrimary')) {
    // Unset other primary accounts for this employee
    await mongoose.model('EmployeeBankAccount').updateMany(
      { tenantId: this.tenantId, employeeId: this.employeeId, _id: { $ne: this._id } },
      { $set: { isPrimary: false } }
    );
  }
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('EmployeeBankAccount', employeeBankAccountSchema);
