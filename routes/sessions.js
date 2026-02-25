const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const sessionController = require('../controllers/sessionController');

router.get('/my', protect, sessionController.getMySessions);
router.get('/all', protect, authorize('Tenant Admin'), sessionController.getAllActiveSessions);
router.get('/stats', protect, authorize('Tenant Admin'), sessionController.getSessionStats);
router.delete('/:userId/all', protect, authorize('Tenant Admin'), sessionController.forceLogoutAllSessions);
router.delete('/:userId/:sessionId', protect, authorize('Tenant Admin'), sessionController.forceLogoutSession);

module.exports = router;
