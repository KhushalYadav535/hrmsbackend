const AuditLog = require('../models/AuditLog');

// Middleware to create audit log entries
exports.createAuditLog = async (req, res, next) => {
  // Store original json method
  const originalJson = res.json.bind(res);

  // Override json method to capture response
  res.json = function (data) {
    // Create audit log after successful operation
    if (req.user && req.tenantId && req.auditAction) {
      AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        action: req.auditAction,
        module: req.auditModule || 'Unknown',
        entityType: req.auditEntityType,
        entityId: req.auditEntityId,
        details: req.auditDetails || `${req.auditAction} operation`,
        changes: req.auditChanges,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: res.statusCode >= 200 && res.statusCode < 300 ? 'Success' : 'Failed',
      }).catch(err => {
        console.error('Failed to create audit log:', err);
        // Don't fail the request if audit log fails
      });
    }

    // Call original json method
    return originalJson(data);
  };

  next();
};

// Helper function to set audit context
exports.setAuditContext = (action, module, entityType = null, details = null, changes = null) => {
  return (req, res, next) => {
    req.auditAction = action;
    req.auditModule = module;
    req.auditEntityType = entityType;
    req.auditDetails = details;
    req.auditChanges = changes;
    next();
  };
};
