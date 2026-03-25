const Tenant = require('../models/Tenant');
const { userHasRole, userHasAnyRole } = require('../utils/userRoles');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

// @desc    Create tenant (Super Admin only) - same as register-tenant: creates tenant + Tenant Admin user
// @route   POST /api/tenants
// @access  Private (Super Admin)
exports.createTenant = async (req, res) => {
  try {
    const { name, code, location, adminEmail, adminPassword, adminName,
      bank_id, bank_code, bank_name, short_name, registration_no, rbi_license_no,
      registered_office, address, city, state, country, pin, phone, email, website } = req.body;
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Name and code are required',
      });
    }
    if (!adminEmail || !adminPassword) {
      return res.status(400).json({
        success: false,
        message: 'Admin email and password are required',
      });
    }
    if (adminPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Admin password must be at least 6 characters',
      });
    }
    const codeUpper = code.toUpperCase().trim();
    const existingTenant = await Tenant.findOne({ code: codeUpper });
    if (existingTenant) {
      return res.status(400).json({
        success: false,
        message: 'Tenant with this code already exists',
      });
    }
    // Check if admin email already exists
    const existingUser = await User.findOne({ email: adminEmail.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    const tenant = await Tenant.create({
      name: name.trim(),
      code: codeUpper,
      location: location || '',
      bank_id: bank_id?.trim() || undefined,
      bank_code: bank_code?.trim() || undefined,
      bank_name: bank_name?.trim() || undefined,
      short_name: short_name?.trim() || undefined,
      registration_no: registration_no?.trim() || undefined,
      rbi_license_no: rbi_license_no?.trim() || undefined,
      registered_office: registered_office?.trim() || undefined,
      address: address?.trim() || undefined,
      city: city?.trim() || undefined,
      state: state?.trim() || undefined,
      country: country?.trim() || undefined,
      pin: pin?.trim() || undefined,
      phone: phone?.trim() || undefined,
      email: email?.trim() || undefined,
      website: website?.trim() || undefined,
    });

    let adminUser;
    try {
      // Create Tenant Admin user - if this fails, rollback tenant
      adminUser = await User.create({
        email: adminEmail.toLowerCase().trim(),
        password: adminPassword,
        name: adminName || 'Tenant Administrator',
        tenantId: tenant._id,
        role: 'Tenant Admin',
        status: 'Active',
      });
    } catch (userError) {
      // Rollback: delete tenant if user creation fails (e.g. invalid password)
      await Tenant.findByIdAndDelete(tenant._id);
      const msg = userError?.message || 'Invalid admin user data';
      return res.status(400).json({
        success: false,
        message: msg,
        error: msg,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        id: tenant._id.toString(),
        name: tenant.name,
        code: tenant.code,
        location: tenant.location,
        status: tenant.status,
        employees: tenant.employees,
        adminUserId: adminUser._id.toString(),
        adminEmail: adminUser.email,
      },
      message: 'Tenant created successfully. Admin user has been created.',
    });
  } catch (error) {
    // Map known validation errors to 400 so UI can show proper message
    if (error && (error.name === 'ValidationError' || typeof error.message === 'string')) {
      const msg = error.message || 'Validation error';
      return res.status(400).json({
        success: false,
        message: msg,
        error: msg,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get all tenants (Super Admin only)
// @route   GET /api/tenants
// @access  Private (Super Admin)
exports.getTenants = async (req, res) => {
  try {
    const tenants = await Tenant.find().sort({ createdAt: -1 });

    // Fetch admin users for each tenant
    const tenantIds = tenants.map(t => t._id);
    const adminUsers = await User.find({ tenantId: { $in: tenantIds }, role: 'Tenant Admin' });
    const adminMap = {};
    adminUsers.forEach(u => {
      adminMap[u.tenantId.toString()] = u;
    });

    res.status(200).json({
      success: true,
      count: tenants.length,
      data: tenants.map(t => {
        const admin = adminMap[t._id.toString()];
        return {
          id: t._id.toString(),
          name: t.name,
          code: t.code,
          location: t.location,
          employees: t.employees,
          status: t.status,
          adminEmail: admin ? admin.email : (t.registrationEmail || ''),
          adminName: admin ? admin.name : '',
          registrationEmail: t.registrationEmail,
          emailVerified: t.emailVerified,
          bank_id: t.bank_id,
          bank_code: t.bank_code,
          bank_name: t.bank_name,
          short_name: t.short_name,
          registration_no: t.registration_no,
          rbi_license_no: t.rbi_license_no,
          registered_office: t.registered_office,
          address: t.address,
          city: t.city,
          state: t.state,
          country: t.country,
          pin: t.pin,
          phone: t.phone,
          email: t.email,
          website: t.website,
          createdAt: t.createdAt,
          approvedBy: t.approvedBy,
          approvedAt: t.approvedAt,
          rejectionReason: t.rejectionReason,
        };
      }),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Approve tenant registration (US-A2-02)
// @route   POST /api/tenants/:id/approve
// @access  Private (Super Admin)
exports.approveTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  
  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: 'Tenant not found',
    });
  }

  if (tenant.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: `Tenant is already ${tenant.status}. Cannot approve.`,
    });
  }

  // Activate tenant
  tenant.status = 'active';
  tenant.approvedBy = req.user._id;
  tenant.approvedAt = new Date();
  await tenant.save();

  // Activate Tenant Admin user
  const adminUser = await User.findOne({ 
    tenantId: tenant._id, 
    email: tenant.registrationEmail 
  });
  if (adminUser) {
    adminUser.status = 'Active';
    await adminUser.save();
  }

  // Send welcome email to tenant admin
  try {
    const { sendNotification } = require('../utils/notificationService');
    await sendNotification({
      tenantId: tenant._id,
      recipientEmail: tenant.registrationEmail,
      recipientName: adminUser?.name || 'Tenant Administrator',
      subject: 'Tenant Registration Approved - Welcome!',
      message: `Your tenant registration for "${tenant.name}" has been approved. You can now log in to the HRMS platform.`,
      html: `
        <p>Dear ${adminUser?.name || 'Tenant Administrator'},</p>
        <p>Congratulations! Your tenant registration for <strong>${tenant.name}</strong> (${tenant.code}) has been approved.</p>
        <p>You can now log in to the HRMS platform using your registered email: <strong>${tenant.registrationEmail}</strong></p>
        <p>Welcome to Indian Bank HRMS!</p>
      `,
    });
  } catch (emailError) {
    console.error('Failed to send approval email:', emailError);
  }

  // Audit log
  await AuditLog.create({
    tenantId: tenant._id,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Tenant Approved',
    module: 'Tenant Management',
    entityType: 'Tenant',
    entityId: tenant._id,
    details: `Tenant "${tenant.name}" (${tenant.code}) approved by Platform Admin`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'Tenant approved successfully',
    data: tenant,
  });
});

// @desc    Reject tenant registration (US-A2-02)
// @route   POST /api/tenants/:id/reject
// @access  Private (Super Admin)
exports.rejectTenant = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  if (!reason || reason.trim().length < 20) {
    return res.status(400).json({
      success: false,
      message: 'Rejection reason is required and must be at least 20 characters',
    });
  }

  const tenant = await Tenant.findById(req.params.id);
  
  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: 'Tenant not found',
    });
  }

  if (tenant.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: `Tenant is already ${tenant.status}. Cannot reject.`,
    });
  }

  // Reject tenant
  tenant.status = 'rejected';
  tenant.rejectionReason = reason.trim();
  await tenant.save();

  // Send rejection email
  try {
    const { sendNotification } = require('../utils/notificationService');
    await sendNotification({
      tenantId: null,
      recipientEmail: tenant.registrationEmail,
      recipientName: 'Tenant Administrator',
      subject: 'Tenant Registration Rejected',
      message: `Your tenant registration for "${tenant.name}" has been rejected. Reason: ${reason}`,
      html: `
        <p>Dear Tenant Administrator,</p>
        <p>We regret to inform you that your tenant registration for <strong>${tenant.name}</strong> (${tenant.code}) has been rejected.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>If you have any questions, please contact our support team.</p>
      `,
    });
  } catch (emailError) {
    console.error('Failed to send rejection email:', emailError);
  }

  // Audit log
  await AuditLog.create({
    tenantId: null,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Tenant Rejected',
    module: 'Tenant Management',
    entityType: 'Tenant',
    entityId: tenant._id,
    details: `Tenant "${tenant.name}" (${tenant.code}) rejected. Reason: ${reason}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Rejected',
  });

  res.status(200).json({
    success: true,
    message: 'Tenant rejected successfully',
    data: tenant,
  });
});

// @desc    Suspend tenant (US-A4-01)
// @route   POST /api/tenants/:id/suspend
// @access  Private (Super Admin)
exports.suspendTenant = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  // Validate reason exists and is a string
  if (!reason || typeof reason !== 'string' || reason.trim().length < 20) {
    return res.status(400).json({
      success: false,
      message: 'Suspension reason is required and must be at least 20 characters',
    });
  }

  const tenant = await Tenant.findById(req.params.id);
  
  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: 'Tenant not found',
    });
  }

  if (tenant.status === 'suspended') {
    return res.status(400).json({
      success: false,
      message: 'Tenant is already suspended',
    });
  }

  if (tenant.status === 'rejected' || tenant.status === 'pending') {
    return res.status(400).json({
      success: false,
      message: `Cannot suspend tenant with status: ${tenant.status}`,
    });
  }

  // Suspend tenant
  tenant.status = 'suspended';
  tenant.suspendedBy = req.user._id;
  tenant.suspendedAt = new Date();
  tenant.suspensionReason = reason.trim();
  await tenant.save();

  // Lock all users for this tenant
  await User.updateMany(
    { tenantId: tenant._id },
    { 
      accountLockedUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Lock for 1 year
      status: 'Inactive'
    }
  );

  // Send suspension email
  try {
    const { sendNotification } = require('../utils/notificationService');
    const adminUser = await User.findOne({ tenantId: tenant._id, role: 'Tenant Admin' });
    if (adminUser) {
      await sendNotification({
        tenantId: tenant._id,
        recipientEmail: adminUser.email,
        recipientName: adminUser.name,
        subject: 'Tenant Account Suspended',
        message: `Your tenant account "${tenant.name}" has been suspended. Reason: ${reason}`,
        html: `
          <p>Dear ${adminUser.name},</p>
          <p>We regret to inform you that your tenant account <strong>${tenant.name}</strong> (${tenant.code}) has been suspended.</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p>All user accounts for this tenant have been locked. Please contact support for assistance.</p>
        `,
      });
    }
  } catch (emailError) {
    console.error('Failed to send suspension email:', emailError);
  }

  // Audit log
  await AuditLog.create({
    tenantId: null,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Suspend',
    module: 'Tenant Management',
    entityType: 'Tenant',
    entityId: tenant._id,
    details: `Tenant "${tenant.name}" (${tenant.code}) suspended. Reason: ${reason}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'Tenant suspended successfully',
    data: tenant,
  });
});

// @desc    Deactivate tenant (US-A4-01)
// @route   POST /api/tenants/:id/deactivate
// @access  Private (Super Admin)
exports.deactivateTenant = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  if (!reason || reason.trim().length < 20) {
    return res.status(400).json({
      success: false,
      message: 'Deactivation reason is required and must be at least 20 characters',
    });
  }

  const tenant = await Tenant.findById(req.params.id);
  
  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: 'Tenant not found',
    });
  }

  if (tenant.status === 'inactive') {
    return res.status(400).json({
      success: false,
      message: 'Tenant is already deactivated',
    });
  }

  // Deactivate tenant
  tenant.status = 'inactive';
  tenant.deactivatedBy = req.user._id;
  tenant.deactivatedAt = new Date();
  tenant.deactivationReason = reason.trim();
  await tenant.save();

  // Lock all users for this tenant
  await User.updateMany(
    { tenantId: tenant._id },
    { 
      accountLockedUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Lock for 1 year
      status: 'Inactive'
    }
  );

  // Send deactivation email
  try {
    const { sendNotification } = require('../utils/notificationService');
    const adminUser = await User.findOne({ tenantId: tenant._id, role: 'Tenant Admin' });
    if (adminUser) {
      await sendNotification({
        tenantId: tenant._id,
        recipientEmail: adminUser.email,
        recipientName: adminUser.name,
        subject: 'Tenant Account Deactivated',
        message: `Your tenant account "${tenant.name}" has been deactivated. Reason: ${reason}`,
        html: `
          <p>Dear ${adminUser.name},</p>
          <p>We regret to inform you that your tenant account <strong>${tenant.name}</strong> (${tenant.code}) has been deactivated.</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p>All user accounts for this tenant have been locked. Please contact support for assistance.</p>
        `,
      });
    }
  } catch (emailError) {
    console.error('Failed to send deactivation email:', emailError);
  }

  // Audit log
  await AuditLog.create({
    tenantId: null,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Deactivate',
    module: 'Tenant Management',
    entityType: 'Tenant',
    entityId: tenant._id,
    details: `Tenant "${tenant.name}" (${tenant.code}) deactivated. Reason: ${reason}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'Tenant deactivated successfully',
    data: tenant,
  });
});

// @desc    Reactivate tenant (US-A4-01)
// @route   POST /api/tenants/:id/reactivate
// @access  Private (Super Admin)
exports.reactivateTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  
  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: 'Tenant not found',
    });
  }

  if (tenant.status === 'active') {
    return res.status(400).json({
      success: false,
      message: 'Tenant is already active',
    });
  }

  // Only allow reactivation for suspended or inactive tenants
  if (tenant.status !== 'suspended' && tenant.status !== 'inactive') {
    return res.status(400).json({
      success: false,
      message: `Cannot reactivate tenant with status: ${tenant.status}. Only suspended or inactive tenants can be reactivated.`,
    });
  }

  // Reactivate tenant
  tenant.status = 'active';
  tenant.suspendedBy = undefined;
  tenant.suspendedAt = undefined;
  tenant.suspensionReason = undefined;
  tenant.deactivatedBy = undefined;
  tenant.deactivatedAt = undefined;
  tenant.deactivationReason = undefined;
  await tenant.save();

  // Unlock all users for this tenant
  await User.updateMany(
    { tenantId: tenant._id },
    { 
      accountLockedUntil: null,
      status: 'Active'
    }
  );

  // Send reactivation email
  try {
    const { sendNotification } = require('../utils/notificationService');
    const adminUser = await User.findOne({ tenantId: tenant._id, role: 'Tenant Admin' });
    if (adminUser) {
      await sendNotification({
        tenantId: tenant._id,
        recipientEmail: adminUser.email,
        recipientName: adminUser.name,
        subject: 'Tenant Account Reactivated',
        message: `Your tenant account "${tenant.name}" has been reactivated.`,
        html: `
          <p>Dear ${adminUser.name},</p>
          <p>We are pleased to inform you that your tenant account <strong>${tenant.name}</strong> (${tenant.code}) has been reactivated.</p>
          <p>All user accounts for this tenant have been unlocked. You can now access the system.</p>
        `,
      });
    }
  } catch (emailError) {
    console.error('Failed to send reactivation email:', emailError);
  }

  // Audit log
  await AuditLog.create({
    tenantId: null,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Reactivate',
    module: 'Tenant Management',
    entityType: 'Tenant',
    entityId: tenant._id,
    details: `Tenant "${tenant.name}" (${tenant.code}) reactivated`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'Tenant reactivated successfully',
    data: tenant,
  });
});

// @desc    Get single tenant
// @route   GET /api/tenants/:id
// @access  Private (Super Admin, Tenant Admin)
exports.getTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: tenant._id.toString(),
        name: tenant.name,
        code: tenant.code,
        location: tenant.location,
        employees: tenant.employees,
        status: tenant.status,
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

// @desc    Get current tenant (for Tenant Admin)
// @route   GET /api/tenants/current
// @access  Private (Tenant Admin)
exports.getCurrentTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found',
      });
    }

    const primaryAdmin = await User.findOne({
      tenantId: tenant._id,
      role: 'Tenant Admin',
    })
      .sort({ createdAt: 1 })
      .select('email name');

    // Convert settings Map to object
    const settingsObj = {};
    if (tenant.settings && tenant.settings instanceof Map) {
      tenant.settings.forEach((value, key) => {
        settingsObj[key] = value;
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: tenant._id.toString(),
        name: tenant.name,
        code: tenant.code,
        location: tenant.location,
        employees: tenant.employees,
        status: tenant.status,
        // Organization profile from Add Tenant (tenant document) — read-only for Tenant Admin
        email: tenant.email || '',
        phone: tenant.phone || '',
        address: tenant.address || '',
        registered_office: tenant.registered_office || '',
        city: tenant.city || '',
        state: tenant.state || '',
        country: tenant.country || '',
        pin: tenant.pin || '',
        website: tenant.website || '',
        bank_id: tenant.bank_id || '',
        bank_code: tenant.bank_code || '',
        bank_name: tenant.bank_name || '',
        short_name: tenant.short_name || '',
        registration_no: tenant.registration_no || '',
        rbi_license_no: tenant.rbi_license_no || '',
        primaryAdminEmail: primaryAdmin ? primaryAdmin.email : '',
        primaryAdminName: primaryAdmin ? primaryAdmin.name : '',
        settings: settingsObj,
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

// @desc    Update tenant
// @route   PUT /api/tenants/:id
// @access  Private (Super Admin, Tenant Admin)
exports.updateTenant = async (req, res) => {
  try {
    let tenant = await Tenant.findById(req.params.id);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found',
      });
    }

    // Ensure tenant isolation - Tenant Admin can only update their own tenant
    if (userHasRole(req.user, 'Tenant Admin') && tenant._id.toString() !== req.tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own tenant',
      });
    }

    const { name, code, location, status, settings, adminEmail, adminName, adminPassword,
      bank_id, bank_code, bank_name, short_name, registration_no, rbi_license_no,
      registered_office, address, city, state, country, pin, phone, email, website } = req.body;

    if (name) tenant.name = name;
    if (location !== undefined) tenant.location = location;
    if (status) tenant.status = status;

    // Bank/org fields (Super Admin only)
    if (userHasRole(req.user, 'Super Admin')) {
      if (bank_id !== undefined) tenant.bank_id = bank_id || '';
      if (bank_code !== undefined) tenant.bank_code = bank_code || '';
      if (bank_name !== undefined) tenant.bank_name = bank_name || '';
      if (short_name !== undefined) tenant.short_name = short_name || '';
      if (registration_no !== undefined) tenant.registration_no = registration_no || '';
      if (rbi_license_no !== undefined) tenant.rbi_license_no = rbi_license_no || '';
      if (registered_office !== undefined) tenant.registered_office = registered_office || '';
      if (address !== undefined) tenant.address = address || '';
      if (city !== undefined) tenant.city = city || '';
      if (state !== undefined) tenant.state = state || '';
      if (country !== undefined) tenant.country = country || '';
      if (pin !== undefined) tenant.pin = pin || '';
      if (phone !== undefined) tenant.phone = phone || '';
      if (email !== undefined) tenant.email = email || '';
      if (website !== undefined) tenant.website = website || '';
    }

    // Super Admin can update tenant code (with uniqueness check)
    if (userHasRole(req.user, 'Super Admin') && code) {
      const codeUpper = code.toUpperCase().trim();
      if (codeUpper !== tenant.code) {
        const existing = await Tenant.findOne({ code: codeUpper });
        if (existing) {
          return res.status(400).json({
            success: false,
            message: 'A tenant with this code already exists',
          });
        }
        tenant.code = codeUpper;
      }
    }
    if (settings) {
      // Update settings Map
      if (!tenant.settings) {
        tenant.settings = new Map();
      }
      Object.keys(settings).forEach(key => {
        tenant.settings.set(key, settings[key]);
      });
    }

    await tenant.save();

    // Update Tenant Admin user if adminEmail, adminName or adminPassword provided (Super Admin only)
    if (userHasRole(req.user, 'Super Admin') && (adminEmail || adminName || adminPassword)) {
      const adminUser = await User.findOne({ tenantId: tenant._id, role: 'Tenant Admin' });
      if (adminUser) {
        if (adminName) adminUser.name = adminName;
        if (adminEmail) {
          const emailLower = adminEmail.toLowerCase().trim();
          if (emailLower !== adminUser.email) {
            const existing = await User.findOne({ email: emailLower });
            if (existing) {
              return res.status(400).json({
                success: false,
                message: 'A user with this email already exists',
              });
            }
            adminUser.email = emailLower;
          }
        }
        if (adminPassword && adminPassword.length >= 6) {
          adminUser.password = adminPassword;
        }
        await adminUser.save();
      }
    }

    // Create audit log
    try {
      const changes = [];
      if (name) changes.push(`Name: ${name}`);
      if (location) changes.push(`Location: ${location}`);
      if (status) changes.push(`Status: ${status}`);
      if (adminEmail) changes.push(`Admin Email updated`);
      if (adminName) changes.push(`Admin Name updated`);
      if (settings) changes.push('Settings updated');

      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Update',
        module: 'Tenant Management',
        entityType: 'Tenant',
        entityId: tenant._id,
        details: `Updated tenant: ${tenant.name}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
        changes: changes.join(', ') || 'Tenant information updated',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    // Convert settings Map to object for response
    const settingsObj = {};
    if (tenant.settings && tenant.settings instanceof Map) {
      tenant.settings.forEach((value, key) => {
        settingsObj[key] = value;
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: tenant._id.toString(),
        name: tenant.name,
        code: tenant.code,
        location: tenant.location,
        employees: tenant.employees,
        status: tenant.status,
        settings: settingsObj,
      },
      message: 'Tenant updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete tenant (Super Admin only)
// @route   DELETE /api/tenants/:id
// @access  Private (Super Admin)
exports.deleteTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    // Delete all users for this tenant
    await User.deleteMany({ tenantId: tenant._id });
    await Tenant.findByIdAndDelete(req.params.id);

    try {
      await AuditLog.create({
        tenantId: null,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Delete',
        module: 'Tenant Management',
        entityType: 'Tenant',
        entityId: tenant._id,
        details: `Tenant "${tenant.name}" (${tenant.code}) deleted`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    res.status(200).json({
      success: true,
      message: 'Tenant deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update tenant settings
// @route   PUT /api/tenants/current/settings
// @access  Private (Tenant Admin)
exports.updateTenantSettings = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found',
      });
    }

    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Settings object is required',
      });
    }

    // Tenant profile / Add Tenant fields live on the Tenant document — not editable via this route
    const reservedSettingsKeys = new Set([
      'organizationName',
      'email',
      'phone',
      'address',
      'name',
      'code',
      'location',
    ]);

    // Update settings Map
    if (!tenant.settings) {
      tenant.settings = new Map();
    }
    Object.keys(settings).forEach((key) => {
      if (reservedSettingsKeys.has(key)) return;
      tenant.settings.set(key, settings[key]);
    });

    await tenant.save();

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Configure',
        module: 'Settings',
        entityType: 'Tenant Settings',
        entityId: tenant._id,
        details: 'Updated tenant settings',
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
        changes: `Updated settings: ${Object.keys(settings).join(', ')}`,
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    // Convert settings Map to object for response
    const settingsObj = {};
    tenant.settings.forEach((value, key) => {
      settingsObj[key] = value;
    });

    res.status(200).json({
      success: true,
      data: {
        settings: settingsObj,
      },
      message: 'Settings updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
