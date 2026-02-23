const moduleManagementService = require('../services/moduleManagementService');

/**
 * Middleware to check if a module is enabled for the user's company (tenant)
 * and if the user has the required permission
 * BRD: Dynamic Module Management System - DM-021
 */
const requireModule = (moduleCode, permission = null) => {
  return async (req, res, next) => {
    try {
      // Super Admin bypasses all module checks
      if (req.user.role === 'Super Admin') return next();

      const tenantId = req.user.tenantId?._id || req.user.tenantId;
      const userId = req.user.id;

      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: 'Tenant not found',
          message: 'Unable to determine your organization.',
        });
      }

      // Check if module is enabled
      const isEnabled = await moduleManagementService.isModuleEnabled(tenantId, moduleCode);

      if (!isEnabled) {
        return res.status(403).json({
          success: false,
          error: 'Module not enabled',
          message: `The ${moduleCode} module is not enabled for your organization. Please contact your administrator.`,
          moduleCode,
        });
      }

      // If permission is specified, check user permission
      // TODO: Implement permission checking logic
      // For now, we'll just check module access
      if (permission) {
        // TODO: Check user permission for this module
        // const hasPermission = await checkUserPermission(userId, moduleCode, permission);
        // if (!hasPermission) {
        //   return res.status(403).json({
        //     success: false,
        //     error: 'Permission denied',
        //     message: `You do not have ${permission} permission for ${moduleCode} module.`,
        //   });
        // }
      }

      // Log module usage
      const PlatformModule = require('../models/PlatformModule');
      const module = await PlatformModule.findOne({ moduleCode });
      
      if (module) {
        await moduleManagementService.logModuleUsage({
          tenantId,
          moduleId: module._id,
          userId,
          action: `${req.method}_${req.path.split('/').pop()}`,
          entityType: extractEntityType(req.path),
        });
      }

      next();
    } catch (error) {
      console.error('Module permission check failed:', error);
      res.status(500).json({
        success: false,
        error: 'Permission check failed',
        message: error.message,
      });
    }
  };
};

/**
 * Helper function to extract entity type from path
 */
function extractEntityType(path) {
  const parts = path.split('/').filter(p => p);
  if (parts.length > 1) {
    return parts[parts.length - 2].toUpperCase();
  }
  return 'UNKNOWN';
}

module.exports = { requireModule };
