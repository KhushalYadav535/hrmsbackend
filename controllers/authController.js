const User = require('../models/User');
const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');
const generateToken = require('../utils/generateToken');
const { generateOTP, hashOTP, generateTOTPSecret, verifyTOTPCode, generateTOTPCode } = require('../services/mfaService');
const { sendNotification } = require('../utils/notificationService');
const crypto = require('crypto');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

// @desc    Register/Sign up user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { email, password, name, tenantId, role } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email, tenantId });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists',
      });
    }

    // Create user
    const user = await User.create({
      email,
      password,
      name,
      tenantId,
      role: role || 'Employee',
    });

    if (user) {
      const token = generateToken(user._id);
      const tenant = await Tenant.findById(user.tenantId);
      
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        token,
        tenant: tenant ? {
          id: tenant._id.toString(),
          name: tenant.name,
          code: tenant.code,
          location: tenant.location,
          employees: tenant.employees,
          status: tenant.status,
        } : null,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId.toString(),
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid user data',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res) => {
  try {
    const { email, password, tenantId } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    // Check for user
    const query = { email };
    if (tenantId) {
      query.tenantId = tenantId;
    }

    const user = await User.findOne(query).populate('tenantId');

    if (!user) {
      // Log failed login attempt (skip audit log if tenantId not provided to avoid errors)
      try {
        if (tenantId) {
          const tenant = await Tenant.findById(tenantId);
          if (tenant) {
            await AuditLog.create({
              tenantId: tenant._id,
              userId: null, // User doesn't exist
              userName: email,
              userEmail: email,
              action: 'Login Failed',
              module: 'Authentication',
              entityType: 'User',
              details: 'Invalid email or password',
              ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
              userAgent: req.get('user-agent') || 'Unknown',
              status: 'Failed',
            });
          }
        }
      } catch (auditError) {
        console.error('Audit log error:', auditError);
        // Don't fail login if audit log fails
      }
      
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // BRD Requirement: Account lockout after 5 failed attempts
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      const minutesRemaining = Math.ceil((user.accountLockedUntil - new Date()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Account is locked. Please try again after ${minutesRemaining} minutes.`,
        lockedUntil: user.accountLockedUntil,
      });
    }

    // BRD Requirement: Check password expiry
    if (user.passwordExpiryDate && user.passwordExpiryDate < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Your password has expired. Please reset your password.',
        passwordExpired: true,
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      // BRD Requirement: Increment failed login attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      
      // BRD Requirement: Lock account after 5 failed attempts
      if (user.failedLoginAttempts >= 5) {
        user.accountLockedUntil = new Date();
        user.accountLockedUntil.setMinutes(user.accountLockedUntil.getMinutes() + 30); // 30 minutes lockout
        await user.save();
        
        // Log account lockout
        try {
          const tenantIdForAuditLock = user.tenantId && user.tenantId._id ? user.tenantId._id : (user.tenantId && user.tenantId.toString ? user.tenantId.toString() : user.tenantId);
          if (tenantIdForAuditLock) {
            await AuditLog.create({
              tenantId: tenantIdForAuditLock,
              userId: user._id,
              userName: user.name || user.email,
              userEmail: user.email,
              action: 'Account Locked',
              module: 'Authentication',
              entityType: 'User',
              details: 'Account locked due to 5 failed login attempts',
              ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
              userAgent: req.get('user-agent') || 'Unknown',
              status: 'Failed',
            });
          }
        } catch (auditError) {
          console.error('Audit log error:', auditError);
        }
        
        return res.status(423).json({
          success: false,
          message: 'Account locked due to multiple failed login attempts. Please try again after 30 minutes.',
          lockedUntil: user.accountLockedUntil,
        });
      } else {
        await user.save();
      }
      
      // Log failed login attempt
      try {
        const tenantIdForAudit = user.tenantId && user.tenantId._id ? user.tenantId._id : (user.tenantId && user.tenantId.toString ? user.tenantId.toString() : user.tenantId);
        if (tenantIdForAudit) {
          await AuditLog.create({
            tenantId: tenantIdForAudit,
            userId: user._id,
            userName: user.name || user.email,
            userEmail: user.email,
            action: 'Login Failed',
            module: 'Authentication',
            entityType: 'User',
            details: `Failed login attempt ${user.failedLoginAttempts}/5`,
            ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
            userAgent: req.get('user-agent') || 'Unknown',
            status: 'Failed',
          });
        }
      } catch (auditError) {
        console.error('Audit log error:', auditError);
        // Don't fail login if audit log fails
      }
      
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        remainingAttempts: 5 - user.failedLoginAttempts,
      });
    }

    // BRD Requirement: Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
    user.lastLogin = new Date();
    
    // Normalize status if it's invalid (fix for existing data with lowercase 'active')
    if (user.status && typeof user.status === 'string') {
      const statusLower = user.status.toLowerCase();
      const validStatuses = ['Pending Activation', 'Active', 'Inactive', 'Locked', 'Suspended', 'Deactivated'];
      const normalizedStatus = validStatuses.find(s => s.toLowerCase() === statusLower);
      if (normalizedStatus) {
        user.status = normalizedStatus;
      } else if (!validStatuses.includes(user.status)) {
        // If status is invalid, set to default
        user.status = 'Active';
      }
    } else if (!user.status) {
      // If status is not set, set to Active for existing users
      user.status = 'Active';
    }
    
    await user.save();

    // BRD Requirement: MFA check for sensitive roles
    const sensitiveRoles = ['Payroll Administrator', 'HR Administrator', 'Tenant Admin', 'Finance Administrator', 'Super Admin'];
    const requiresMFA = sensitiveRoles.includes(user.role) && user.mfaEnabled;

    if (requiresMFA) {
      // Return token with MFA required flag
      const token = generateToken(user._id);
      return res.status(200).json({
        success: true,
        requiresMFA: true,
        mfaMethod: user.mfaMethod,
        message: 'MFA verification required',
        tempToken: token, // Temporary token, will be replaced after MFA verification
      });
    }

    // Log successful login
    try {
      const tenantIdForAudit = user.tenantId && user.tenantId._id ? user.tenantId._id : (user.tenantId && user.tenantId.toString ? user.tenantId.toString() : user.tenantId);
      if (tenantIdForAudit) {
        await AuditLog.create({
          tenantId: tenantIdForAudit,
          userId: user._id,
          userName: user.name || user.email,
          userEmail: user.email,
          action: 'Login Success',
          module: 'Authentication',
          entityType: 'User',
          details: 'User logged in successfully',
          ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
          userAgent: req.get('user-agent') || 'Unknown',
          status: 'Success',
        });
      }
    } catch (auditError) {
      console.error('Audit log error:', auditError);
      // Don't fail login if audit log fails
    }

    const token = generateToken(user._id);
    
    // Get tenant details - handle both populated and non-populated cases
    let tenant = null;
    if (user.tenantId) {
      if (user.tenantId._id) {
        // Already populated
        tenant = user.tenantId;
      } else {
        // Not populated, fetch it
        try {
          tenant = await Tenant.findById(user.tenantId);
        } catch (tenantError) {
          console.error('Error fetching tenant:', tenantError);
        }
      }
    }
    
    res.status(200).json({
      success: true,
      token,
      tenant: tenant ? {
        id: tenant._id.toString(),
        name: tenant.name,
        code: tenant.code,
        location: tenant.location,
        employees: tenant.employees,
        status: tenant.status,
      } : null,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId && user.tenantId._id ? user.tenantId._id.toString() : (user.tenantId ? user.tenantId.toString() : null),
        passwordExpiryDate: user.passwordExpiryDate,
        mfaEnabled: user.mfaEnabled,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    throw error; // Let asyncHandler handle it
  }
});

// @desc    Verify MFA
// @route   POST /api/auth/mfa/verify
// @access  Private
// BRD Requirement: "Multi-Factor Authentication (MFA): SMS OTP, Email OTP, or Authenticator App"
exports.verifyMFA = asyncHandler(async (req, res) => {
  const { code, method } = req.body;
  
  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'MFA code is required',
    });
  }

  // Get user from token (should be set by protect middleware)
  const user = await User.findById(req.user._id);

  if (!user || !user.mfaEnabled) {
    return res.status(400).json({
      success: false,
      message: 'MFA is not enabled for this user',
    });
  }

  // Verify MFA code based on method
  let isValid = false;

  if (method === 'Authenticator' || user.mfaMethod === 'Authenticator') {
    // TOTP verification (using authenticator app)
    isValid = verifyTOTPCode(code, user.mfaSecret);
  } else if (method === 'SMS' || user.mfaMethod === 'SMS') {
    // SMS OTP verification - verify against stored OTP hash
    if (user.mfaOTPHash && user.mfaOTPExpiry && user.mfaOTPExpiry > Date.now()) {
      isValid = hashOTP(code) === user.mfaOTPHash;
    }
  } else if (method === 'Email' || user.mfaMethod === 'Email') {
    // Email OTP verification - verify against stored OTP hash
    if (user.mfaOTPHash && user.mfaOTPExpiry && user.mfaOTPExpiry > Date.now()) {
      isValid = hashOTP(code) === user.mfaOTPHash;
    }
  }

  if (!isValid) {
    // Log failed MFA attempt
    await AuditLog.create({
      tenantId: user.tenantId,
      userId: user._id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: 'MFA Failed',
      module: 'Authentication',
      entityType: 'User',
      details: 'Invalid MFA code',
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Failed',
    });

    return res.status(401).json({
      success: false,
      message: 'Invalid MFA code',
    });
  }

  // Clear OTP after successful verification (for SMS/Email)
  if (user.mfaMethod === 'SMS' || user.mfaMethod === 'Email') {
    user.mfaOTPHash = undefined;
    user.mfaOTPExpiry = undefined;
    await user.save();
  }

  // Log successful MFA verification
  await AuditLog.create({
    tenantId: user.tenantId,
    userId: user._id,
    userName: user.name || user.email,
    userEmail: user.email,
    action: 'MFA Verified',
    module: 'Authentication',
    entityType: 'User',
    details: 'MFA verification successful',
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });

  // Generate final token after MFA verification
  const token = generateToken(user._id);
  const tenant = await Tenant.findById(user.tenantId);

  res.status(200).json({
    success: true,
    token,
    tenant: tenant ? {
      id: tenant._id.toString(),
      name: tenant.name,
      code: tenant.code,
      location: tenant.location,
      employees: tenant.employees,
      status: tenant.status,
    } : null,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId.toString(),
    },
    message: 'MFA verification successful',
  });
});

// @desc    Setup MFA
// @route   POST /api/auth/mfa/setup
// @access  Private
exports.setupMFA = asyncHandler(async (req, res) => {
  const { method } = req.body;
  
  if (!['SMS', 'Email', 'Authenticator'].includes(method)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid MFA method. Supported: SMS, Email, Authenticator',
    });
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  user.mfaEnabled = true;
  user.mfaMethod = method;

  if (method === 'Authenticator') {
    // Generate TOTP secret using mfaService
    const secretObj = generateTOTPSecret();
    // speakeasy returns an object with base32, ascii, hex properties
    user.mfaSecret = typeof secretObj === 'string' ? secretObj : (secretObj.base32 || secretObj.ascii || secretObj.hex || JSON.stringify(secretObj));
    
    // Return QR code URL for authenticator app setup
    const tenant = await Tenant.findById(user.tenantId);
    const issuer = tenant?.name || 'HRMS';
    const secretForQR = typeof secretObj === 'string' ? user.mfaSecret : (secretObj.base32 || user.mfaSecret);
    const qrCodeUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}?secret=${secretForQR}&issuer=${encodeURIComponent(issuer)}`;
    
    await user.save();

    // Log MFA setup
    await AuditLog.create({
      tenantId: user.tenantId,
      userId: user._id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: 'MFA Setup',
      module: 'Authentication',
      entityType: 'User',
      details: `MFA enabled with ${method} method`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    res.status(200).json({
      success: true,
      mfaSecret: user.mfaSecret,
      qrCodeUrl,
      message: 'MFA setup successful. Scan QR code with authenticator app.',
    });
  } else {
    // For SMS/Email, OTP will be sent during login
    await user.save();

    // Log MFA setup
    await AuditLog.create({
      tenantId: user.tenantId,
      userId: user._id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: 'MFA Setup',
      module: 'Authentication',
      entityType: 'User',
      details: `MFA enabled with ${method} method`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    res.status(200).json({
      success: true,
      message: `MFA enabled with ${method} method`,
    });
  }
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('tenantId').select('-password');

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Register new tenant
// @route   POST /api/auth/register-tenant
// @access  Public
exports.registerTenant = async (req, res) => {
  try {
    const { tenantName, code, location, adminEmail, adminPassword, adminName } = req.body;

    // Check if tenant exists
    const tenantExists = await Tenant.findOne({ code: code.toUpperCase() });

    if (tenantExists) {
      return res.status(400).json({
        success: false,
        message: 'Tenant with this code already exists',
      });
    }

    // Create tenant
    const tenant = await Tenant.create({
      name: tenantName,
      code: code.toUpperCase(),
      location,
    });

    // Create admin user for tenant
    const adminUser = await User.create({
      email: adminEmail,
      password: adminPassword,
      name: adminName || 'Tenant Administrator',
      tenantId: tenant._id,
      role: 'Tenant Admin',
    });

    const token = generateToken(adminUser._id);

    res.status(201).json({
      success: true,
      message: 'Tenant registered successfully',
      token,
      tenant: {
        id: tenant._id,
        name: tenant.name,
        code: tenant.code,
      },
      user: {
        id: adminUser._id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
// BRD Requirement: Password reset via email/SMS
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email, tenantId } = req.body;

  const query = { email };
  if (tenantId) query.tenantId = tenantId;

  const user = await User.findOne(query).populate('tenantId');

  if (!user) {
    // Don't reveal if user exists (security best practice)
    return res.status(200).json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent',
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const resetTokenExpiry = new Date();
  resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // 1 hour expiry

  // Store reset token
  user.resetToken = resetTokenHash;
  user.resetTokenExpiry = resetTokenExpiry;
  await user.save();

  // Send reset email
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&email=${email}`;
  
  await sendNotification({
    tenantId: user.tenantId._id || user.tenantId,
    recipientEmail: user.email,
    recipientName: user.name,
    subject: 'Password Reset Request',
    message: `You requested a password reset. Click the link to reset your password: ${resetUrl}`,
    html: `<p>Dear ${user.name},</p><p>You requested a password reset. Click the link below to reset your password:</p><p><a href="${resetUrl}">Reset Password</a></p><p>This link will expire in 1 hour.</p><p>If you didn't request this, please ignore this email.</p>`,
  });

  await AuditLog.create({
    tenantId: user.tenantId._id || user.tenantId,
    userId: user._id,
    userName: user.name,
    userEmail: user.email,
    action: 'Password Reset Requested',
    module: 'Authentication',
    entityType: 'User',
    details: 'Password reset requested',
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'Password reset link sent to your email',
  });
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, email, newPassword } = req.body;

  if (!token || !email || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Token, email, and new password are required',
    });
  }

  const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    email,
    resetToken: resetTokenHash,
    resetTokenExpiry: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token',
    });
  }

  // Set new password
  user.password = newPassword;
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  user.failedLoginAttempts = 0;
  user.accountLockedUntil = null;
  await user.save();

  await AuditLog.create({
    tenantId: user.tenantId,
    userId: user._id,
    userName: user.name,
    userEmail: user.email,
    action: 'Password Reset',
    module: 'Authentication',
    entityType: 'User',
    details: 'Password reset successfully',
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'Password reset successfully',
  });
});

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Current password and new password are required',
    });
  }

  const user = await User.findById(req.user._id);

  // Verify current password
  const isPasswordValid = await user.comparePassword(currentPassword);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: 'Current password is incorrect',
    });
  }

  // Set new password
  user.password = newPassword;
  user.passwordChangeRequired = false;
  await user.save();

  await AuditLog.create({
    tenantId: user.tenantId,
    userId: user._id,
    userName: user.name,
    userEmail: user.email,
    action: 'Password Changed',
    module: 'Authentication',
    entityType: 'User',
    details: 'Password changed successfully',
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'Password changed successfully',
  });
});

// @desc    Unlock account
// @route   POST /api/auth/unlock-account
// @access  Private (Admin only)
exports.unlockAccount = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!['Tenant Admin', 'Super Admin', 'HR Administrator'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Only administrators can unlock accounts',
    });
  }

  const user = await User.findOne({
    _id: userId,
    tenantId: req.tenantId,
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  user.failedLoginAttempts = 0;
  user.accountLockedUntil = null;
  await user.save();

  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Account Unlocked',
    module: 'UAM',
    entityType: 'User',
    entityId: user._id,
    description: `Account unlocked for ${user.name}`,
  });

  res.status(200).json({
    success: true,
    message: 'Account unlocked successfully',
  });
});

// @desc    Disable MFA
// @route   POST /api/auth/disable-mfa
// @access  Private
exports.disableMFA = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user.mfaEnabled) {
    return res.status(400).json({
      success: false,
      message: 'MFA is not enabled for this account',
    });
  }

  user.mfaEnabled = false;
  user.mfaMethod = undefined;
  user.mfaSecret = undefined;
  await user.save();

  await AuditLog.create({
    tenantId: user.tenantId,
    userId: user._id,
    userName: user.name,
    userEmail: user.email,
    action: 'MFA Disabled',
    module: 'Authentication',
    entityType: 'User',
    details: 'MFA disabled',
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'MFA disabled successfully',
  });
});
