const express = require('express');
const {
  getDashboardStats,
  getComprehensiveReports,
  getStandardReportTypes,
  generateStandardReport,
  getScheduledReports,
  createScheduledReport,
  updateScheduledReport,
} = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

const router = express.Router();

router.use(protect);
router.use(setTenant);
router.use(requireModule('REPORTS_BASIC')); // BRD: DM-037 - Module access protection

router.get('/dashboard-stats', authorize('Tenant Admin', 'Super Admin'), getDashboardStats);
router.get('/comprehensive', authorize('Tenant Admin', 'HR Administrator', 'Payroll Administrator', 'Finance Administrator', 'Auditor'), getComprehensiveReports);

// BR-P1-006: Standard reports & scheduled delivery
router.get('/standard-types', authorize('Tenant Admin', 'HR Administrator', 'Payroll Administrator', 'Finance Administrator', 'Auditor'), getStandardReportTypes);
router.post('/standard', authorize('Tenant Admin', 'HR Administrator', 'Payroll Administrator', 'Finance Administrator', 'Auditor'), generateStandardReport);
router.get('/scheduled', authorize('Tenant Admin', 'HR Administrator', 'Payroll Administrator'), getScheduledReports);
router.post('/scheduled', authorize('Tenant Admin', 'HR Administrator', 'Payroll Administrator'), createScheduledReport);
router.patch('/scheduled/:id', authorize('Tenant Admin', 'HR Administrator', 'Payroll Administrator'), updateScheduledReport);

module.exports = router;
