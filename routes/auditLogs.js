const express = require('express');
const router = express.Router();
const {
  getAuditLogs,
  getAuditLog,
  createAuditLog,
  exportAuditLogs,
} = require('../controllers/auditLogController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// All routes require authentication and tenant context
router.use(protect);
router.use(setTenant);

// Get all audit logs
router.get(
  '/',
  authorize('Tenant Admin', 'HR Administrator', 'System Administrator', 'Auditor'),
  getAuditLogs
);

// Export audit logs
router.get(
  '/export',
  authorize('Tenant Admin', 'HR Administrator'),
  exportAuditLogs
);

// Get single audit log
router.get('/:id', getAuditLog);

// Create audit log (for internal use by other controllers)
router.post('/', createAuditLog);

module.exports = router;
