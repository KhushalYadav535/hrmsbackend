const moduleManagementService = require('../services/moduleManagementService');
const AuditLog = require('../models/AuditLog');

/**
 * Module Management Controller
 * BRD: Dynamic Module Management System
 */

// ============================================================
// PLATFORM ADMIN ROUTES
// ============================================================

/**
 * GET /api/platform/modules
 * Get all platform modules
 */
exports.getAllPlatformModules = async (req, res) => {
  try {
    const { category, isActive } = req.query;
    const modules = await moduleManagementService.getAllModules({ category, isActive });
    
    res.json({ success: true, data: modules, modules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/platform/companies/:tenantId/modules
 * Get modules for a specific company (tenant)
 */
exports.getCompanyModules = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { includeInactive } = req.query;
    
    const modules = await moduleManagementService.getCompanyModules(
      tenantId,
      includeInactive === 'true'
    );
    
    res.json({ success: true, data: modules, modules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/platform/companies/:tenantId/modules/:moduleId/enable
 * Enable a module for a company (tenant)
 */
exports.enableModule = async (req, res) => {
  try {
    const { tenantId, moduleId } = req.params;
    const {
      pricingModel,
      monthlyCost,
      userLimit,
      moduleConfig,
      trialDays,
    } = req.body;

    const result = await moduleManagementService.enableModule({
      tenantId,
      moduleId,
      pricingModel,
      monthlyCost,
      userLimit,
      moduleConfig,
      trialDays,
      activatedBy: req.user?.id || req.user?._id?.toString?.() || req.user?.email || 'system',
    });

    // Audit log (use schema-valid values)
    const userObj = req.user || {};
    await AuditLog.create({
      tenantId,
      userId: userObj.id || userObj._id,
      userName: userObj.name || userObj.email || 'System',
      userEmail: userObj.email,
      action: 'Configure',
      module: 'Module Management',
      details: JSON.stringify({
        action: 'module_enabled',
        tenantId,
        moduleId,
        moduleCode: result.moduleId?.moduleCode,
      }),
    });

    res.json({ success: true, module: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/platform/companies/:tenantId/modules/:moduleId/disable
 * Disable a module for a company (tenant)
 */
exports.disableModule = async (req, res) => {
  try {
    const { tenantId, moduleId } = req.params;
    const { reason } = req.body;

    const result = await moduleManagementService.disableModule(
      tenantId,
      moduleId,
      reason,
      req.user.id || req.user.email
    );

    // Audit log (use schema-valid values)
    const userObj = req.user || {};
    await AuditLog.create({
      tenantId,
      userId: userObj.id || userObj._id,
      userName: userObj.name || userObj.email || 'System',
      userEmail: userObj.email,
      action: 'Configure',
      module: 'Module Management',
      details: JSON.stringify({
        action: 'module_disabled',
        tenantId,
        moduleId,
        reason,
      }),
    });

    res.json({ success: true, module: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/platform/module-requests
 * Get all pending module activation requests
 */
exports.getModuleRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const ModuleActivationRequest = require('../models/ModuleActivationRequest');
    
    const query = {};
    if (status) {
      query.status = status;
    }
    
    const requests = await ModuleActivationRequest.find(query)
      .populate('tenantId', 'name code')
      .populate('moduleId', 'moduleName moduleCode')
      .sort({ requestedAt: -1 });
    
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/platform/module-requests/:requestId/approve
 * Approve a module activation request
 */
exports.approveModuleRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { customPricing } = req.body;

    const result = await moduleManagementService.approveModuleRequest(
      requestId,
      req.user.id || req.user.email,
      customPricing
    );

    // Audit log
    await AuditLog.create({
      userId: req.user.id || req.user._id,
      action: 'MODULE_REQUEST_APPROVED',
      module: 'Module Management',
      details: { requestId },
    });

    res.json({ success: true, request: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/platform/module-requests/:requestId/reject
 * Reject a module activation request
 */
exports.rejectModuleRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { rejectionReason } = req.body;

    const result = await moduleManagementService.rejectModuleRequest(
      requestId,
      req.user.id || req.user.email,
      rejectionReason
    );

    // Audit log
    await AuditLog.create({
      userId: req.user.id || req.user._id,
      action: 'MODULE_REQUEST_REJECTED',
      module: 'Module Management',
      details: { requestId, rejectionReason },
    });

    res.json({ success: true, request: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/platform/companies/:tenantId/subscription/package
 * Apply a subscription package to a company (tenant)
 */
exports.applySubscriptionPackage = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { packageId } = req.body;

    const result = await moduleManagementService.applySubscriptionPackage(
      tenantId,
      packageId,
      req.user?.id || req.user?.email || 'system'
    );

    // Audit log (use schema-valid values)
    const userObj = req.user || {};
    await AuditLog.create({
      tenantId,
      userId: userObj.id || userObj._id,
      userName: userObj.name || userObj.email || 'System',
      userEmail: userObj.email,
      action: 'Configure',
      module: 'Module Management',
      details: JSON.stringify({
        action: 'subscription_package_applied',
        tenantId,
        packageId,
      }),
    });

    res.json({ success: true, subscription: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================================
// COMPANY ADMIN ROUTES
// ============================================================

/**
 * GET /api/company/modules
 * Get modules for current company (tenant)
 */
exports.getMyCompanyModules = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const modules = await moduleManagementService.getCompanyModules(tenantId);
    
    res.json({ success: true, modules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/company/module-requests
 * Get module requests for current company (tenant)
 */
exports.getMyCompanyModuleRequests = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { status } = req.query;
    const ModuleActivationRequest = require('../models/ModuleActivationRequest');

    const query = { tenantId };
    if (status) {
      query.status = status;
    }

    const requests = await ModuleActivationRequest.find(query)
      .populate('moduleId', 'moduleName moduleCode description')
      .sort({ requestedAt: -1 });

    res.json({ success: true, data: requests, requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/company/module-requests
 * Request module activation
 */
exports.requestModuleActivation = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const {
      moduleId,
      requestType,
      businessJustification,
      expectedUsers,
      trialRequested,
    } = req.body;

    const result = await moduleManagementService.requestModuleActivation({
      tenantId,
      moduleId,
      requestType,
      businessJustification,
      expectedUsers,
      trialRequested,
      requestedBy: req.user.id || req.user.email,
    });

    // Audit log
    await AuditLog.create({
      userId: req.user.id || req.user._id,
      action: 'MODULE_ACTIVATION_REQUESTED',
      module: 'Module Management',
      details: { tenantId, moduleId, requestType },
    });

    res.json({ success: true, request: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/company/available-modules
 * Get available modules (not yet enabled)
 */
exports.getAvailableModules = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    
    // Get all modules
    const allModules = await moduleManagementService.getAllModules();
    
    // Get enabled modules
    const enabledModules = await moduleManagementService.getCompanyModules(tenantId);
    const enabledModuleIds = new Set(enabledModules.map(m => m.moduleId._id.toString()));
    
    // Filter available modules (not core, not enabled)
    const availableModules = allModules.filter(
      m => !m.isCore && !enabledModuleIds.has(m._id.toString())
    );

    res.json({ success: true, modules: availableModules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================
// COMMON ROUTES (All authenticated users)
// ============================================================

/**
 * GET /api/modules/check/:moduleCode
 * Check if a module is enabled for current company (tenant)
 */
exports.checkModuleAccess = async (req, res) => {
  try {
    const { moduleCode } = req.params;
    const tenantId = req.user.tenantId;

    const isEnabled = await moduleManagementService.isModuleEnabled(tenantId, moduleCode);

    res.json({ success: true, enabled: isEnabled });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
