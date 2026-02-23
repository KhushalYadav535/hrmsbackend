const express = require('express');
const router = express.Router();
const moduleManagementController = require('../controllers/moduleManagementController');
const { protect, authorize } = require('../middleware/auth');

// ============================================================
// PLATFORM ADMIN ROUTES
// ============================================================

/**
 * GET /api/platform/modules
 * Get all platform modules
 */
router.get(
  '/platform/modules',
  protect,
  authorize('Super Admin'),
  moduleManagementController.getAllPlatformModules
);

/**
 * GET /api/platform/companies/:tenantId/modules
 * Get modules for a specific company (tenant)
 */
router.get(
  '/platform/companies/:tenantId/modules',
  protect,
  authorize('Super Admin'),
  moduleManagementController.getCompanyModules
);

/**
 * POST /api/platform/companies/:tenantId/modules/:moduleId/enable
 * Enable a module for a company (tenant)
 */
router.post(
  '/platform/companies/:tenantId/modules/:moduleId/enable',
  protect,
  authorize('Super Admin'),
  moduleManagementController.enableModule
);

/**
 * POST /api/platform/companies/:tenantId/modules/:moduleId/disable
 * Disable a module for a company (tenant)
 */
router.post(
  '/platform/companies/:tenantId/modules/:moduleId/disable',
  protect,
  authorize('Super Admin'),
  moduleManagementController.disableModule
);

/**
 * GET /api/platform/module-requests
 * Get all pending module activation requests
 */
router.get(
  '/platform/module-requests',
  protect,
  authorize('Super Admin'),
  moduleManagementController.getModuleRequests
);

/**
 * POST /api/platform/module-requests/:requestId/approve
 * Approve a module activation request
 */
router.post(
  '/platform/module-requests/:requestId/approve',
  protect,
  authorize('Super Admin'),
  moduleManagementController.approveModuleRequest
);

/**
 * POST /api/platform/module-requests/:requestId/reject
 * Reject a module activation request
 */
router.post(
  '/platform/module-requests/:requestId/reject',
  protect,
  authorize('Super Admin'),
  moduleManagementController.rejectModuleRequest
);

/**
 * POST /api/platform/companies/:tenantId/subscription/package
 * Apply a subscription package to a company (tenant)
 */
router.post(
  '/platform/companies/:tenantId/subscription/package',
  protect,
  authorize('Super Admin'),
  moduleManagementController.applySubscriptionPackage
);

// ============================================================
// COMPANY ADMIN ROUTES
// ============================================================

/**
 * GET /api/company/modules
 * Get modules for current company (tenant)
 */
router.get(
  '/company/modules',
  protect,
  authorize('Tenant Admin', 'HR Administrator'),
  moduleManagementController.getMyCompanyModules
);

/**
 * GET /api/company/module-requests
 * Get module requests for current company (tenant)
 */
router.get(
  '/company/module-requests',
  protect,
  authorize('Tenant Admin', 'HR Administrator'),
  moduleManagementController.getMyCompanyModuleRequests
);

/**
 * POST /api/company/module-requests
 * Request module activation
 */
router.post(
  '/company/module-requests',
  protect,
  authorize('Tenant Admin'),
  moduleManagementController.requestModuleActivation
);

/**
 * GET /api/company/available-modules
 * Get available modules (not yet enabled)
 */
router.get(
  '/company/available-modules',
  protect,
  authorize('Tenant Admin', 'HR Administrator'),
  moduleManagementController.getAvailableModules
);

// ============================================================
// COMMON ROUTES (All authenticated users)
// ============================================================

/**
 * GET /api/modules/check/:moduleCode
 * Check if a module is enabled for current company (tenant)
 */
router.get(
  '/modules/check/:moduleCode',
  protect,
  moduleManagementController.checkModuleAccess
);

module.exports = router;
