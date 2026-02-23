const express = require('express');
const router = express.Router();
const {
  requestCompOff,
  approveCompOff,
  getCompOff,
  availCompOff,
  expireCompOffs,
} = require('../controllers/compOffController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('LEAVE')); // BRD: DM-037 - Module access protection

router.post('/request', authorize('Employee'), requestCompOff);
router.patch('/:id/approve', authorize('Manager', 'HR Administrator', 'Tenant Admin'), approveCompOff);
router.post('/:id/avail', authorize('Employee'), availCompOff);
router.get('/', getCompOff);
router.post('/expire', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), expireCompOffs);

module.exports = router;
