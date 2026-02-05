const express = require('express');
const { getDashboardStats, getComprehensiveReports } = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

const router = express.Router();

router.use(protect);
router.use(setTenant);

router.get('/dashboard-stats', authorize('Tenant Admin', 'Super Admin'), getDashboardStats);
router.get('/comprehensive', authorize('Tenant Admin', 'HR Administrator', 'Payroll Administrator', 'Finance Administrator', 'Auditor'), getComprehensiveReports);

module.exports = router;
