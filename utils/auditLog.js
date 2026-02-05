const AuditLog = require('../models/AuditLog');

/**
 * Create audit log entry
 * Utility function for controllers to create audit logs
 */
async function createAuditLog({
  tenantId,
  userId,
  userName,
  userEmail,
  action,
  module,
  entityType,
  entityId,
  description,
  details,
  changes,
  ipAddress,
  userAgent,
  status = 'Success',
}) {
  try {
    // Normalize action to match AuditLog enum values
    const validActions = ['Create', 'Update', 'Delete', 'Approve', 'Reject', 'Login', 'Logout', 'View', 'Export', 'Import', 'Configure'];
    let normalizedAction = action || 'Create';
    
    // Convert common variations to valid enum values
    if (typeof normalizedAction === 'string') {
      normalizedAction = normalizedAction.charAt(0).toUpperCase() + normalizedAction.slice(1).toLowerCase();
      // Handle special cases
      if (normalizedAction === 'Submit') normalizedAction = 'Create';
      if (normalizedAction === 'Verify') normalizedAction = 'Approve';
      if (normalizedAction === 'Generate') normalizedAction = 'Create';
    }
    
    // Ensure action is in valid enum
    if (!validActions.includes(normalizedAction)) {
      normalizedAction = 'Create'; // Default fallback
    }

    const auditLog = await AuditLog.create({
      tenantId,
      userId,
      userName: userName || 'System',
      userEmail: userEmail || '',
      action: normalizedAction,
      module: module || 'Unknown',
      entityType: entityType || null,
      entityId: entityId || null,
      details: description || details || `${normalizedAction} operation`,
      changes: changes || null,
      ipAddress: ipAddress || 'Unknown',
      userAgent: userAgent || 'Unknown',
      status,
    });

    return auditLog;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error - audit logging should not break the main flow
    return null;
  }
}

module.exports = {
  createAuditLog,
};
