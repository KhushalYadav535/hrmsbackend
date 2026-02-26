const PlatformSettings = require('../models/PlatformSettings');
const { createAuditLog } = require('../utils/auditLog');

const DEFAULTS = {
  billingCycle: 'MONTHLY',
  autoRenew: true,
  currency: 'INR',
  whitelabelEnabled: false,
  appName: 'Indian Bank HRMS',
  supportEmail: 'support@example.com',
};

exports.getSettings = async (req, res) => {
  try {
    const docs = await PlatformSettings.find();
    const settings = {};
    docs.forEach(d => { settings[d.key] = d.value; });
    Object.keys(DEFAULTS).forEach(k => {
      if (settings[k] === undefined) settings[k] = DEFAULTS[k];
    });
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await PlatformSettings.findOneAndUpdate(
        { key },
        { key, value, updatedBy: req.user?.email || req.user?.id },
        { upsert: true, new: true }
      );
    }
    const docs = await PlatformSettings.find();
    const settings = {};
    docs.forEach(d => { settings[d.key] = d.value; });

    // Audit log
    await createAuditLog({
      userId: req.user?._id,
      userName: req.user?.name || 'Super Admin',
      userEmail: req.user?.email,
      action: 'Configure',
      module: 'Platform',
      entityType: 'PlatformSettings',
      description: `Platform settings updated: ${Object.keys(updates).join(', ')}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'Success',
    });

    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
