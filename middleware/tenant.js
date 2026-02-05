// Multi-tenant middleware
// Ensures all queries are scoped to the current tenant
const mongoose = require('mongoose');

exports.setTenant = (req, res, next) => {
  // Tenant ID should come from authenticated user
  // This middleware adds tenantId to request for use in controllers
  if (req.user && req.user.tenantId) {
    // Handle populated tenantId (object with _id) or direct ObjectId
    if (req.user.tenantId._id) {
      req.tenantId = req.user.tenantId._id;
    } else if (req.user.tenantId.toString) {
      req.tenantId = req.user.tenantId;
    } else {
      req.tenantId = req.user.tenantId;
    }
    
    // Ensure tenantId is a valid ObjectId
    if (req.tenantId && !mongoose.Types.ObjectId.isValid(req.tenantId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant ID format',
      });
    }
  } else if (req.headers['x-tenant-id']) {
    // Allow tenant ID from header for super admin operations
    req.tenantId = req.headers['x-tenant-id'];
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.tenantId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant ID format in header',
      });
    }
  }

  if (!req.tenantId && req.user?.role !== 'Super Admin') {
    return res.status(400).json({
      success: false,
      message: 'Tenant ID is required',
    });
  }

  next();
};

// Filter query to include tenantId
exports.filterByTenant = (Model) => {
  return async (req, res, next) => {
    // For Super Admin, allow cross-tenant access if tenantId is provided
    if (req.user.role === 'Super Admin' && req.query.tenantId) {
      req.tenantId = req.query.tenantId;
    }

    // Add tenantId to query filter
    if (req.tenantId) {
      req.queryFilter = { ...req.queryFilter, tenantId: req.tenantId };
    }

    next();
  };
};
