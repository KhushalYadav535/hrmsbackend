const PlatformIntegration = require('../models/PlatformIntegration');
const { createAuditLog } = require('../utils/auditLog');

const DEFAULT_INTEGRATIONS = [
  { integrationCode: 'BIOMETRIC', integrationName: 'Biometric Integration', category: 'BIOMETRIC', description: 'Fingerprint/face attendance sync' },
  { integrationCode: 'WHATSAPP', integrationName: 'WhatsApp Integration', category: 'MESSAGING', description: 'WhatsApp notifications' },
  { integrationCode: 'EMAIL_SMS', integrationName: 'Email/SMS Gateway', category: 'EMAIL_SMS', description: 'Email and SMS notifications' },
  { integrationCode: 'CBS', integrationName: 'CBS (Core Banking)', category: 'BANKING', description: 'Core banking integration' },
  { integrationCode: 'MOBILE_APP', integrationName: 'Mobile App Access', category: 'MOBILE', description: 'Mobile app API access' },
  { integrationCode: 'API_ACCESS', integrationName: 'API Access', category: 'API', description: 'External API access' },
];

exports.getIntegrations = async (req, res) => {
  try {
    let integrations = await PlatformIntegration.find().sort({ sortOrder: 1 });
    if (integrations.length === 0) {
      await PlatformIntegration.insertMany(DEFAULT_INTEGRATIONS);
      integrations = await PlatformIntegration.find().sort({ sortOrder: 1 });
    }
    res.json({ success: true, data: integrations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateIntegration = async (req, res) => {
  try {
    const { isEnabled, config } = req.body;
    const integration = await PlatformIntegration.findByIdAndUpdate(
      req.params.id,
      { ...(isEnabled !== undefined && { isEnabled }), ...(config && { config }) },
      { new: true }
    );
    if (!integration) return res.status(404).json({ success: false, message: 'Integration not found' });

    // Audit log
    await createAuditLog({
      userId: req.user?._id,
      userName: req.user?.name || 'Super Admin',
      userEmail: req.user?.email,
      action: 'Configure',
      module: 'Platform',
      entityType: 'Integration',
      entityId: integration._id,
      description: `Integration "${integration.integrationName}" ${isEnabled ? 'enabled' : 'disabled'}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'Success',
    });

    res.json({ success: true, data: integration });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
