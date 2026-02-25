const Tenant = require('../models/Tenant');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// @desc    Create tenant (Super Admin only) - same as register-tenant: creates tenant + Tenant Admin user
// @route   POST /api/tenants
// @access  Private (Super Admin)
exports.createTenant = async (req, res) => {
  try {
    const { name, code, location, adminEmail, adminPassword, adminName } = req.body;
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
    });

    // Create Tenant Admin user (same as register-tenant flow)
    const adminUser = await User.create({
      email: adminEmail.toLowerCase().trim(),
      password: adminPassword,
      name: adminName || 'Tenant Administrator',
      tenantId: tenant._id,
      role: 'Tenant Admin',
      status: 'Active',
    });

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
          adminEmail: admin ? admin.email : '',
          adminName: admin ? admin.name : '',
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
    if (req.user.role === 'Tenant Admin' && tenant._id.toString() !== req.tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own tenant',
      });
    }

    const { name, location, status, settings, adminEmail, adminName } = req.body;

    if (name) tenant.name = name;
    if (location) tenant.location = location;
    if (status) tenant.status = status;
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

    // Update Tenant Admin user if adminEmail or adminName provided (Super Admin only)
    if (req.user.role === 'Super Admin' && (adminEmail || adminName)) {
      const adminUser = await User.findOne({ tenantId: tenant._id, role: 'Tenant Admin' });
      if (adminUser) {
        if (adminName) adminUser.name = adminName;
        if (adminEmail) {
          const emailLower = adminEmail.toLowerCase().trim();
          // Check email uniqueness only if it changed
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

    // Update settings Map
    if (!tenant.settings) {
      tenant.settings = new Map();
    }
    Object.keys(settings).forEach(key => {
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
