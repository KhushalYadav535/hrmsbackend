const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  // BRD Requirement: Username must be unique
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    comment: 'Format: firstname.lastname or employee_id',
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  // BRD Requirement: Link to employee
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    index: true,
    comment: 'BRD: Every employee must have exactly one user account',
  },
  password: {
    type: String,
    required: true,
    minlength: 12, // BRD Requirement: Minimum 12 characters
  },
  passwordHistory: [{
    password: String,
    changedAt: Date,
  }],
  passwordExpiryDate: {
    type: Date,
    comment: 'BRD Requirement: Password expiry after 90 days',
  },
  failedLoginAttempts: {
    type: Number,
    default: 0,
    comment: 'BRD Requirement: Account lockout after 5 failed attempts',
  },
  accountLockedUntil: {
    type: Date,
    comment: 'BRD Requirement: Lockout duration 30 minutes',
  },
  lastPasswordChangeDate: {
    type: Date,
    default: Date.now,
  },
  mfaEnabled: {
    type: Boolean,
    default: false,
    comment: 'BRD Requirement: MFA for sensitive roles',
  },
  mfaSecret: {
    type: String,
    comment: 'TOTP secret for authenticator app',
  },
  mfaMethod: {
    type: String,
    enum: ['SMS', 'Email', 'Authenticator'],
  },
  mfaOTPHash: {
    type: String,
    comment: 'Hashed OTP for SMS/Email MFA verification',
  },
  mfaOTPExpiry: {
    type: Date,
    comment: 'OTP expiry time (typically 5-10 minutes)',
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: [
      'Super Admin',
      'Tenant Admin',
      'HR Administrator',
      'Payroll Administrator',
      'Finance Administrator',
      'Manager',
      'Employee',
      'Auditor',
    ],
    required: true,
  },
  designation: {
    type: String,
    trim: true,
  },
  department: {
    type: String,
    trim: true,
  },
  // BRD Requirement: Account status
  status: {
    type: String,
    enum: ['Pending Activation', 'Active', 'Inactive', 'Locked', 'Suspended', 'Deactivated'],
    default: 'Pending Activation',
    set: function(value) {
      // Normalize status value (handle lowercase 'active' from old data)
      if (value && typeof value === 'string') {
        const statusLower = value.toLowerCase();
        const validStatuses = ['Pending Activation', 'Active', 'Inactive', 'Locked', 'Suspended', 'Deactivated'];
        const normalizedStatus = validStatuses.find(s => s.toLowerCase() === statusLower);
        return normalizedStatus || value;
      }
      return value;
    },
  },
  // BRD Requirement: Password change required on first login
  passwordChangeRequired: {
    type: Boolean,
    default: true,
  },
  // BRD Requirement: Account deactivation
  deactivatedDate: Date,
  deactivatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // BRD Requirement: Account retention (90 days before deletion)
  deletionScheduledDate: Date,
  // Password reset
  resetToken: String,
  resetTokenExpiry: Date,
  joinDate: {
    type: Date,
    default: Date.now,
  },
  avatar: {
    type: String,
  },
  lastLogin: {
    type: Date,
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

// Compound index for tenantId and email
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

// Hash password before saving
// BRD Requirement: Password policy enforcement
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    if (typeof next === 'function') {
      return next();
    }
    return;
  }

  // BRD Requirement: Password policy validation
  const password = this.password;
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
  
  if (!passwordRegex.test(password)) {
    const error = new Error('Password must be at least 12 characters with uppercase, lowercase, digit, and special character');
    if (typeof next === 'function') {
      return next(error);
    }
    throw error;
  }

  // BRD Requirement: Password history (last 5 passwords)
  if (this.passwordHistory && this.passwordHistory.length > 0) {
    // Check if password matches any of the last 5 passwords
    for (const oldPassword of this.passwordHistory.slice(-5)) {
      const isMatch = await bcrypt.compare(password, oldPassword.password);
      if (isMatch) {
        const error = new Error('Password cannot be same as any of the last 5 passwords');
        if (typeof next === 'function') {
          return next(error);
        }
        throw error;
      }
    }
  }

  // Store old password in history before hashing
  if (this.isNew && this.passwordHistory) {
    // For new users, no history yet
  } else if (!this.isNew && this.passwordHistory) {
    // Add current password to history (before it gets hashed)
    const currentHashedPassword = this.password; // This is already hashed from previous save
    this.passwordHistory.push({
      password: currentHashedPassword,
      changedAt: new Date(),
    });
    // Keep only last 5
    if (this.passwordHistory.length > 5) {
      this.passwordHistory = this.passwordHistory.slice(-5);
    }
  }

  // Hash the new password
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  
  // BRD Requirement: Set password expiry (90 days from now)
  this.passwordExpiryDate = new Date();
  this.passwordExpiryDate.setDate(this.passwordExpiryDate.getDate() + 90);
  this.lastPasswordChangeDate = new Date();
  
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

// Normalize status before save (handle legacy lowercase values)
userSchema.pre('save', function (next) {
  if (this.status && typeof this.status === 'string') {
    const statusLower = this.status.toLowerCase();
    const validStatuses = ['Pending Activation', 'Active', 'Inactive', 'Locked', 'Suspended', 'Deactivated'];
    const normalizedStatus = validStatuses.find(s => s.toLowerCase() === statusLower);
    if (normalizedStatus && normalizedStatus !== this.status) {
      this.status = normalizedStatus;
    } else if (!validStatuses.includes(this.status)) {
      // If status is invalid, set to Active for existing users, Pending Activation for new
      this.status = this.isNew ? 'Pending Activation' : 'Active';
    }
  } else if (!this.status && !this.isNew) {
    // If status is missing for existing user, set to Active
    this.status = 'Active';
  }
  if (typeof next === 'function') {
    next();
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
