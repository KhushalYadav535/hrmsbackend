const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

// TODO: Implement one-time payment routes when controller is created
router.get('/', authorize('HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Super Admin'), async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'One-time payment routes not yet implemented',
  });
});

module.exports = router;
