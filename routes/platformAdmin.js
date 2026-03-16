const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const subscriptionPackageController = require('../controllers/subscriptionPackageController');
const platformModuleController = require('../controllers/platformModuleController');
const integrationController = require('../controllers/integrationController');
const platformSettingsController = require('../controllers/platformSettingsController');
const platformAnalyticsController = require('../controllers/platformAnalyticsController');
const { getPlatformAuditLogs, exportPlatformAuditLogs } = require('../controllers/auditLogController');

router.use(protect);
router.use(authorize('Super Admin'));

// Subscription Packages
router.get('/subscription-packages', subscriptionPackageController.getPackages);
router.get('/subscription-packages/:id', subscriptionPackageController.getPackage);
router.post('/subscription-packages', subscriptionPackageController.createPackage);
router.put('/subscription-packages/:id', subscriptionPackageController.updatePackage);
router.delete('/subscription-packages/:id', subscriptionPackageController.deletePackage);
router.post('/subscription-packages/:id/archive', subscriptionPackageController.archivePackage);

// Platform Modules (create/edit - in addition to moduleManagement)
router.post('/modules', platformModuleController.createModule);
router.put('/modules/:id', platformModuleController.updateModule);

// Integrations
router.get('/integrations', integrationController.getIntegrations);
router.put('/integrations/:id', integrationController.updateIntegration);
router.post('/integrations/:id/test-connection', integrationController.testConnection);
router.get('/integrations/health', integrationController.getIntegrationHealth);

// Platform Settings
router.get('/settings', platformSettingsController.getSettings);
router.put('/settings', platformSettingsController.updateSettings);

// Analytics
router.get('/analytics', platformAnalyticsController.getAnalytics);
router.get('/analytics/export', platformAnalyticsController.exportAnalytics);

// Platform Audit Logs (Super Admin — no tenant filter)
router.get('/audit-logs', getPlatformAuditLogs);
router.get('/audit-logs/export', exportPlatformAuditLogs);

module.exports = router;
