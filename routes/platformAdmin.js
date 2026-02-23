const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const subscriptionPackageController = require('../controllers/subscriptionPackageController');
const platformModuleController = require('../controllers/platformModuleController');
const integrationController = require('../controllers/integrationController');
const platformSettingsController = require('../controllers/platformSettingsController');
const platformAnalyticsController = require('../controllers/platformAnalyticsController');

router.use(protect);
router.use(authorize('Super Admin'));

// Subscription Packages
router.get('/subscription-packages', subscriptionPackageController.getPackages);
router.get('/subscription-packages/:id', subscriptionPackageController.getPackage);
router.post('/subscription-packages', subscriptionPackageController.createPackage);
router.put('/subscription-packages/:id', subscriptionPackageController.updatePackage);
router.delete('/subscription-packages/:id', subscriptionPackageController.deletePackage);

// Platform Modules (create/edit - in addition to moduleManagement)
router.post('/modules', platformModuleController.createModule);
router.put('/modules/:id', platformModuleController.updateModule);

// Integrations
router.get('/integrations', integrationController.getIntegrations);
router.put('/integrations/:id', integrationController.updateIntegration);

// Platform Settings
router.get('/settings', platformSettingsController.getSettings);
router.put('/settings', platformSettingsController.updateSettings);

// Analytics
router.get('/analytics', platformAnalyticsController.getAnalytics);

module.exports = router;
