const express = require('express');
const router = express.Router();
const {
  register,
  login,
  logout,
  getMe,
  registerTenant,
  forgotPassword,
  resetPassword,
  changePassword,
  unlockAccount,
  disableMFA,
  setupMFA,
  verifyMFA,
} = require('../controllers/authController');
const { ssoLogin } = require('../controllers/ldapController');
const { protect } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/register-tenant', registerTenant);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/sso', ssoLogin);

// Protected routes
router.use(protect);
router.use(setTenant);
router.get('/me', getMe);
router.post('/logout', logout); // BR-P0-001 Bug 1: Logout endpoint
router.post('/change-password', changePassword);
router.post('/unlock-account', unlockAccount);
router.post('/setup-mfa', setupMFA);
router.post('/verify-mfa', verifyMFA);
router.post('/disable-mfa', disableMFA);

module.exports = router;
