const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

// TODO: Implement exit settlement routes when controller is created
router.get('/', authorize('HR Administrator', 'Payroll Administrator', 'Tenant Admin', 'Super Admin'), async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Exit settlement routes not yet implemented',
  });
});

module.exports = router;
