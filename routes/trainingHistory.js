const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

// TODO: Implement training history routes when controller is created
router.get('/', authorize('HR Administrator', 'Employee', 'Manager', 'Tenant Admin', 'Super Admin'), async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Training history routes not yet implemented',
  });
});

module.exports = router;
