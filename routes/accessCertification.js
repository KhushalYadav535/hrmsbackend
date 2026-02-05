const express = require('express');
const router = express.Router();
const {
  createCertificationCampaign,
  certifyUserAccess,
  bulkCertify,
  getCertificationCampaigns,
  getCertificationCampaign,
  getCampaignsDueForReminder,
} = require('../controllers/accessCertificationController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication and tenant context
router.use(protect);
router.use(setTenant);

// Create certification campaign (BR-UAM-006)
router.post(
  '/campaigns',
  authorize('Tenant Admin', 'HR Administrator', 'Auditor'),
  createCertificationCampaign
);

// Get all certification campaigns
router.get(
  '/campaigns',
  authorize('Tenant Admin', 'HR Administrator', 'Manager', 'Auditor'),
  getCertificationCampaigns
);

// Get single certification campaign
router.get(
  '/campaigns/:id',
  authorize('Tenant Admin', 'HR Administrator', 'Manager', 'Auditor'),
  getCertificationCampaign
);

// Certify user access (BR-UAM-006)
router.post(
  '/campaigns/:campaignId/certify/:userId',
  authorize('Manager', 'Tenant Admin', 'HR Administrator'),
  certifyUserAccess
);

// Bulk certify (BR-UAM-006)
router.post(
  '/campaigns/:campaignId/bulk-certify',
  authorize('Manager', 'Tenant Admin', 'HR Administrator'),
  bulkCertify
);

// Get campaigns due for reminder (BR-UAM-006)
router.get(
  '/campaigns/reminders/due',
  authorize('Tenant Admin', 'HR Administrator', 'System Administrator'),
  getCampaignsDueForReminder
);

module.exports = router;
