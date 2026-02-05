const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

// TODO: Implement career planning routes when controller is created
router.get('/', authorize('HR Administrator', 'Employee', 'Manager', 'Tenant Admin', 'Super Admin'), async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Career planning routes not yet implemented',
  });
});

module.exports = router;
