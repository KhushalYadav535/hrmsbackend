const AuditLog = require('../models/AuditLog');

// @desc    Get all audit logs
// @route   GET /api/audit-logs
// @access  Private (Tenant Admin, HR Administrator, System Administrator)
exports.getAuditLogs = async (req, res) => {
  try {
    const { module, action, status, dateFrom, dateTo, userId, search } = req.query;
    const filter = { tenantId: req.tenantId };

    if (module && module !== 'all') {
      filter.module = module;
    }

    if (action && action !== 'all') {
      filter.action = action;
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (userId) {
      filter.userId = userId;
    }

    if (dateFrom || dateTo) {
      filter.timestamp = {};
      if (dateFrom) {
        filter.timestamp.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = endDate;
      }
    }

    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { details: { $regex: search, $options: 'i' } },
        { module: { $regex: search, $options: 'i' } },
      ];
    }

    const auditLogs = await AuditLog.find(filter)
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(1000); // Limit to prevent performance issues

    res.status(200).json({
      success: true,
      count: auditLogs.length,
      data: auditLogs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single audit log
// @route   GET /api/audit-logs/:id
// @access  Private
exports.getAuditLog = async (req, res) => {
  try {
    const auditLog = await AuditLog.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('userId', 'name email role');

    if (!auditLog) {
      return res.status(404).json({
        success: false,
        message: 'Audit log not found',
      });
    }

    res.status(200).json({
      success: true,
      data: auditLog,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create audit log (internal use)
// @route   POST /api/audit-logs
// @access  Private (System)
exports.createAuditLog = async (req, res) => {
  try {
    const {
      userId,
      userName,
      userEmail,
      action,
      module,
      entityType,
      entityId,
      details,
      changes,
      ipAddress,
      userAgent,
      status,
    } = req.body;

    const auditLog = await AuditLog.create({
      tenantId: req.tenantId,
      userId: userId || req.user._id,
      userName: userName || req.user.name,
      userEmail: userEmail || req.user.email,
      action,
      module,
      entityType,
      entityId,
      details,
      changes,
      ipAddress: ipAddress || req.ip,
      userAgent: userAgent || req.get('user-agent'),
      status: status || 'Success',
    });

    res.status(201).json({
      success: true,
      data: auditLog,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Export audit logs
// @route   GET /api/audit-logs/export
// @access  Private (Tenant Admin, HR Administrator)
exports.exportAuditLogs = async (req, res) => {
  try {
    const { module, action, status, dateFrom, dateTo } = req.query;
    const filter = { tenantId: req.tenantId };

    if (module && module !== 'all') filter.module = module;
    if (action && action !== 'all') filter.action = action;
    if (status && status !== 'all') filter.status = status;

    if (dateFrom || dateTo) {
      filter.timestamp = {};
      if (dateFrom) filter.timestamp.$gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = endDate;
      }
    }

    const auditLogs = await AuditLog.find(filter)
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(10000);

    res.status(200).json({
      success: true,
      count: auditLogs.length,
      data: auditLogs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
