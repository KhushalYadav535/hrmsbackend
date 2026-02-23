const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');

// @desc    Create tenant (Super Admin only)
// @route   POST /api/tenants
// @access  Private (Super Admin)
exports.createTenant = async (req, res) => {
  try {
    const { name, code, location } = req.body;
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Name and code are required',
      });
    }
    const codeUpper = code.toUpperCase().trim();
    const existing = await Tenant.findOne({ code: codeUpper });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Tenant with this code already exists',
      });
    }
    const tenant = await Tenant.create({
      name: name.trim(),
      code: codeUpper,
      location: location || '',
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
      },
      message: 'Tenant created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
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

    res.status(200).json({
      success: true,
      count: tenants.length,
      data: tenants.map(t => ({
        id: t._id.toString(),
        name: t.name,
        code: t.code,
        location: t.location,
        employees: t.employees,
        status: t.status,
      })),
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

    const { name, location, status, settings } = req.body;

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

    // Create audit log
    try {
      const changes = [];
      if (name && name !== tenant.name) changes.push(`Name: ${tenant.name}`);
      if (location && location !== tenant.location) changes.push(`Location: ${tenant.location}`);
      if (status && status !== tenant.status) changes.push(`Status: ${tenant.status}`);
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
