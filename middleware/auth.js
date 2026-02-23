const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify JWT token
// BR-P0-001 Bug 3: Read token from HttpOnly cookie (fallback to Authorization header for backward compatibility)
exports.protect = async (req, res, next) => {
  try {
    let token;

    // BR-P0-001 Bug 3: Check for token in HttpOnly cookie first
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    // Fallback to Authorization header for backward compatibility
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route. Please login again.',
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password').populate('tenantId');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found. Please login again.',
        });
      }

      // BR-P0-001 Bug 1: Check forced logout
      if (req.user.forcedLogoutAt && req.user.forcedLogoutAt > new Date(decoded.iat * 1000)) {
        // Forced logout happened after token was issued
        return res.status(401).json({
          success: false,
          message: 'Your session has been terminated by an administrator. Please login again.',
        });
      }

      // BR-P0-001 Bug 1: Check concurrent session (if sessionId is set)
      if (req.user.sessionId && decoded.sessionId && req.user.sessionId !== decoded.sessionId) {
        return res.status(401).json({
          success: false,
          message: 'Your session has expired due to login from another device. Please login again.',
        });
      }

      // BR-P0-001 Bug 1: Check session timeout (30 min inactivity)
      const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
      if (req.user.lastActivityAt) {
        const timeSinceLastActivity = Date.now() - new Date(req.user.lastActivityAt).getTime();
        if (timeSinceLastActivity > SESSION_TIMEOUT_MS) {
          return res.status(401).json({
            success: false,
            message: 'Session expired due to inactivity. Please login again.',
          });
        }
      }

      // BR-P0-001 Bug 1: Update lastActivityAt
      req.user.lastActivityAt = new Date();
      await req.user.save({ validateBeforeSave: false }); // Save without validation to avoid password issues

      // Set tenantId from user
      req.tenantId = req.user.tenantId._id || req.user.tenantId;

      next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};

// Super Admin only
exports.superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'Super Admin') {
    return res.status(403).json({
      success: false,
      message: 'Super Admin access required',
    });
  }
  next();
};
