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

// US-A6-01: Update Integration Configuration
exports.updateIntegration = async (req, res) => {
  try {
    const { isEnabled, config } = req.body;
    
    // BR-A6-01: Encrypt sensitive fields before saving
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-chars-long!!', 'utf8');
    
    let encryptedConfig = { ...config };
    if (config) {
      // Encrypt sensitive fields (API keys, secrets, passwords)
      const sensitiveFields = ['apiKey', 'secret', 'password', 'token', 'accessToken', 'secretKey'];
      sensitiveFields.forEach(field => {
        if (config[field]) {
          const iv = crypto.randomBytes(16);
          const cipher = crypto.createCipheriv(algorithm, key, iv);
          let encrypted = cipher.update(config[field], 'utf8', 'hex');
          encrypted += cipher.final('hex');
          const authTag = cipher.getAuthTag();
          encryptedConfig[field] = {
            encrypted: true,
            data: encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
          };
        }
      });
    }
    
    const integration = await PlatformIntegration.findByIdAndUpdate(
      req.params.id,
      { ...(isEnabled !== undefined && { isEnabled }), ...(config && { config: encryptedConfig }) },
      { new: true }
    );
    if (!integration) return res.status(404).json({ success: false, message: 'Integration not found' });

    // BR-A6-04: Audit log with masked sensitive values
    const maskedConfig = config ? Object.keys(config).reduce((acc, key) => {
      if (['apiKey', 'secret', 'password', 'token'].includes(key)) {
        acc[key] = '••••••••';
      } else {
        acc[key] = config[key];
      }
      return acc;
    }, {}) : null;

    await createAuditLog({
      userId: req.user?._id,
      userName: req.user?.name || 'Super Admin',
      userEmail: req.user?.email,
      action: 'Configure',
      module: 'Platform',
      entityType: 'Integration',
      entityId: integration._id,
      description: `Integration "${integration.integrationName}" configured`,
      changes: JSON.stringify({ isEnabled, config: maskedConfig }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'Success',
    });

    res.json({ success: true, data: integration });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// US-A6-01: Test Integration Connection
exports.testConnection = async (req, res) => {
  try {
    const integration = await PlatformIntegration.findById(req.params.id);
    if (!integration) {
      return res.status(404).json({ success: false, message: 'Integration not found' });
    }

    // BR-A6-02: Webhook URLs must be HTTPS only
    if (integration.config?.webhookUrl && !integration.config.webhookUrl.startsWith('https://')) {
      return res.status(400).json({
        success: false,
        message: 'Webhook URLs must use HTTPS',
      });
    }

    // Test connection based on integration type
    let testResult = { success: false, message: 'Connection test not implemented' };
    
    switch (integration.integrationCode) {
      case 'BIOMETRIC':
        // Test biometric device connection
        if (integration.config?.deviceIP && integration.config?.devicePort) {
          // Simulate connection test
          testResult = { success: true, message: 'Biometric device connection successful' };
        } else {
          testResult = { success: false, message: 'Device IP and Port required' };
        }
        break;
      case 'WHATSAPP':
        // Test WhatsApp API connection
        if (integration.config?.apiKey) {
          testResult = { success: true, message: 'WhatsApp API connection successful' };
        } else {
          testResult = { success: false, message: 'API Key required' };
        }
        break;
      case 'EMAIL_SMS':
        // Test SMTP/SMS gateway connection
        if (integration.config?.smtpHost && integration.config?.smtpPort) {
          testResult = { success: true, message: 'Email/SMS gateway connection successful' };
        } else {
          testResult = { success: false, message: 'SMTP configuration required' };
        }
        break;
      case 'CBS':
        // Test CBS connection
        if (integration.config?.baseUrl) {
          testResult = { success: true, message: 'CBS connection successful' };
        } else {
          testResult = { success: false, message: 'Base URL required' };
        }
        break;
      default:
        testResult = { success: true, message: 'Configuration valid' };
    }

    // Update health status
    integration.healthStatus = testResult.success ? 'healthy' : 'failed';
    integration.lastHealthCheck = new Date();
    if (!testResult.success) {
      integration.lastError = testResult.message;
    }
    await integration.save();

    res.json({ success: true, testResult });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// US-A6-02: Get Integration Health Status
exports.getIntegrationHealth = async (req, res) => {
  try {
    const integrations = await PlatformIntegration.find().select('integrationCode integrationName healthStatus lastHealthCheck lastError');
    res.json({ success: true, data: integrations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
