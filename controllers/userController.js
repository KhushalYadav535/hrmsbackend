const User = require('../models/User');
const Employee = require('../models/Employee');
const { generateEmployeeId } = require('../services/employeeIdService');
const { createAuditLog } = require('../utils/auditLog');
const { sendNotification } = require('../utils/notificationService');
const { generateTemporaryPassword } = require('../services/employeeIdService');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

// @desc    Create user account
// @route   POST /api/users
// @access  Private (Tenant Admin, HR Administrator)
// BRD: BR-UAM-001
exports.createUser = asyncHandler(async (req, res) => {
  const { email, name, employeeId, role, designation, department, username, payrollSubRole } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({
    tenantId: req.tenantId,
    $or: [{ email }, { username }],
  });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User with this email or username already exists',
    });
  }

  // Generate username if not provided
  let generatedUsername = username;
  if (!generatedUsername) {
    const nameParts = name.split(' ');
    generatedUsername = `${nameParts[0].toLowerCase()}.${nameParts.slice(1).join('').toLowerCase()}`;
    
    // Ensure uniqueness
    let counter = 1;
    while (await User.findOne({ tenantId: req.tenantId, username: generatedUsername })) {
      generatedUsername = `${nameParts[0].toLowerCase()}.${nameParts.slice(1).join('').toLowerCase()}${counter}`;
      counter++;
    }
  }

  // Generate temporary password
  const tempPassword = generateTemporaryPassword();

  const user = await User.create({
    tenantId: req.tenantId,
    email,
    name,
    username: generatedUsername,
    employeeId,
    password: tempPassword,
    role: role || 'Employee',
    payrollSubRole: role === 'Payroll Administrator' && (payrollSubRole === 'Maker' || payrollSubRole === 'Checker') ? payrollSubRole : null,
    designation,
    department,
    status: 'Pending Activation',
    passwordChangeRequired: true,
  });

  // Send welcome email with credentials
  await sendNotification({
    tenantId: req.tenantId,
    recipientEmail: user.email,
    recipientName: user.name,
    subject: 'Welcome to Indian Bank HRMS - Account Created',
    message: `Your HRMS account has been created. Username: ${user.username}, Temporary Password: ${tempPassword}. Please change your password on first login.`,
    html: `<p>Dear ${user.name},</p><p>Welcome to Indian Bank HRMS!</p><p>Your account has been created:</p><p><strong>Username:</strong> ${user.username}</p><p><strong>Temporary Password:</strong> ${tempPassword}</p><p>Please login and change your password immediately.</p>`,
  });

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'UAM',
    entityType: 'User',
    entityId: user._id,
    description: `User account created: ${user.name} (${user.username})`,
  });

  const userResponse = user.toObject();
  delete userResponse.password;

  res.status(201).json({
    success: true,
    data: userResponse,
    tempPassword, // Return for admin reference
    message: 'User account created successfully',
  });
});

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Tenant Admin, HR Administrator, System Administrator)
exports.getUsers = asyncHandler(async (req, res) => {
  try {
    const { search, status, role } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status && status !== 'all') {
      filter.status = status.toLowerCase();
    }

    if (role && role !== 'all') {
      filter.role = role;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('-password') // Exclude password
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
exports.getUser = asyncHandler(async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

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
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Tenant Admin, HR Administrator)
exports.updateUser = asyncHandler(async (req, res) => {
  try {
    const { name, role, designation, department, status, payrollSubRole } = req.body;

    const user = await User.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Only Tenant Admin can change roles
    if (role && req.user.role !== 'Tenant Admin') {
      return res.status(403).json({
        success: false,
        message: 'Only Tenant Admin can change user roles',
      });
    }

    if (name) user.name = name;
    if (role) user.role = role;
    if (designation) user.designation = designation;
    if (department) user.department = department;
    if (status) user.status = status;
    // BRD: Payroll Maker-Checker - clear payrollSubRole if role changes away from Payroll Administrator
    if (role && role !== 'Payroll Administrator') {
      user.payrollSubRole = null;
    } else if (payrollSubRole !== undefined) {
      user.payrollSubRole = payrollSubRole === '' || payrollSubRole === null ? null : payrollSubRole;
    }

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      data: userResponse,
      message: 'User updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// @desc    Reset user password
// @route   POST /api/users/:id/reset-password
// @access  Private (Tenant Admin, HR Administrator)
exports.resetUserPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  // Generate new temporary password
  const tempPassword = generateTemporaryPassword();
  user.password = tempPassword;
  user.passwordChangeRequired = true;
  user.failedLoginAttempts = 0;
  user.accountLockedUntil = null;
  await user.save();

  // Send password reset email
  await sendNotification({
    tenantId: req.tenantId,
    recipientEmail: user.email,
    recipientName: user.name,
    subject: 'Password Reset - Indian Bank HRMS',
    message: `Your password has been reset. New temporary password: ${tempPassword}. Please change it on next login.`,
    html: `<p>Dear ${user.name},</p><p>Your password has been reset by an administrator.</p><p><strong>New Temporary Password:</strong> ${tempPassword}</p><p>Please login and change your password immediately.</p>`,
  });

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    module: 'UAM',
    entityType: 'User',
    entityId: user._id,
    description: `Password reset for ${user.name}`,
  });

  res.status(200).json({
    success: true,
    message: 'Password reset successfully',
    tempPassword, // Return for admin reference
  });
});

// @desc    Deactivate user account
// @route   POST /api/users/:id/deactivate
// @access  Private (Tenant Admin, HR Administrator)
// BRD: BR-UAM-001 - Account deactivation within 24 hours of separation
exports.deactivateUser = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  // Prevent deactivating own account
  if (user._id.toString() === req.user._id.toString()) {
    return res.status(400).json({
      success: false,
      message: 'You cannot deactivate your own account',
    });
  }

  user.status = 'Deactivated';
  user.deactivatedDate = Date.now();
  user.deactivatedBy = req.user._id;
  
  // Schedule deletion after 90 days
  const deletionDate = new Date();
  deletionDate.setDate(deletionDate.getDate() + 90);
  user.deletionScheduledDate = deletionDate;

  await user.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    module: 'UAM',
    entityType: 'User',
    entityId: user._id,
    description: `User account deactivated: ${user.name}. Reason: ${reason || 'Not specified'}`,
  });

  res.status(200).json({
    success: true,
    message: 'User account deactivated successfully',
    data: user,
  });
});

// @desc    Activate user account
// @route   POST /api/users/:id/activate
// @access  Private (Tenant Admin, HR Administrator)
exports.activateUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  user.status = 'Active';
  user.deactivatedDate = undefined;
  user.deactivatedBy = undefined;
  user.deletionScheduledDate = undefined;
  await user.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    module: 'UAM',
    entityType: 'User',
    entityId: user._id,
    description: `User account activated: ${user.name}`,
  });

  res.status(200).json({
    success: true,
    message: 'User account activated successfully',
    data: user,
  });
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Tenant Admin only)
// BRD: BR-UAM-001 - Deleted accounts retained in archive for 7 years
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  // Prevent deleting own account
  if (user._id.toString() === req.user._id.toString()) {
    return res.status(400).json({
      success: false,
      message: 'You cannot delete your own account',
    });
  }

  // BRD: Archive before deletion (in production, move to archive table)
  // For now, just delete (archive implementation can be added later)
  await User.findByIdAndDelete(user._id);

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'DELETE',
    module: 'UAM',
    entityType: 'User',
    entityId: req.params.id,
    description: `User account deleted: ${user.name}`,
  });

  res.status(200).json({
    success: true,
    message: 'User deleted successfully',
  });
});
