const express = require('express');
const router = express.Router();
const {
  syncBiometricPunches,
  processPunches,
  getBiometricPunches,
} = require('../controllers/biometricController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('ATTENDANCE')); // BRD: DM-037

router.post('/sync', authorize('HR Administrator', 'Tenant Admin'), syncBiometricPunches);
router.post('/process', authorize('HR Administrator', 'Tenant Admin'), processPunches);
router.get('/punches', getBiometricPunches);

module.exports = router;
