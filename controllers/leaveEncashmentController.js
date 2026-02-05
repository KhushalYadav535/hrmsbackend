const LeaveEncashment = require('../models/LeaveEncashment');
const Employee = require('../models/Employee');
const LeaveBalance = require('../models/LeaveBalance');
const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get all leave encashments
 * BRD Requirement: Leave encashment management
 */
exports.getLeaveEncashments = asyncHandler(async (req, res) => {
  const { employeeId, status, financialYear } = req.query;

  const query = {
    tenantId: req.tenantId,
  };

  if (employeeId) {
    query.employeeId = employeeId;
  }

  if (status) {
    query.status = status;
  }

  if (financialYear) {
    query.financialYear = parseInt(financialYear);
  }

  const encashments = await LeaveEncashment.find(query)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('approvedBy', 'name email')
    .populate('processedBy', 'name email')
    .sort({ requestedDate: -1 });

  res.status(200).json({
    success: true,
    count: encashments.length,
    data: encashments,
  });
});

/**
 * Get a single encashment
 */
exports.getLeaveEncashment = asyncHandler(async (req, res) => {
  const encashment = await LeaveEncashment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('approvedBy', 'name email')
    .populate('processedBy', 'name email');

  if (!encashment) {
    return res.status(404).json({
      success: false,
      message: 'Leave encashment not found',
    });
  }

  res.status(200).json({
    success: true,
    data: encashment,
  });
});

/**
 * Create leave encashment request
 */
exports.createLeaveEncashment = asyncHandler(async (req, res) => {
  const { employeeId, leaveType, days, reason, financialYear } = req.body;

  if (!employeeId || !leaveType || !days) {
    return res.status(400).json({
      success: false,
      message: 'Employee ID, leave type, and days are required',
    });
  }

  // Verify employee belongs to tenant
  const employee = await Employee.findOne({
    _id: employeeId,
    tenantId: req.tenantId,
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  // Get leave balance
  const currentYear = financialYear || (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  const leaveBalance = await LeaveBalance.findOne({
    tenantId: req.tenantId,
    employeeId: employeeId,
    leaveType: leaveType,
    financialYear: currentYear,
  });

  if (!leaveBalance || leaveBalance.currentBalance < days) {
    return res.status(400).json({
      success: false,
      message: `Insufficient leave balance. Available: ${leaveBalance?.currentBalance || 0} days, Requested: ${days} days`,
    });
  }

  // Calculate daily rate (simplified - use employee's daily salary)
  const dailyRate = (employee.salary || 0) / 30; // Assuming monthly salary

  const encashment = await LeaveEncashment.create({
    tenantId: req.tenantId,
    employeeId: employeeId,
    leaveType: leaveType,
    days: days,
    dailyRate: dailyRate,
    encashmentAmount: days * dailyRate,
    financialYear: currentYear,
    reason: reason || '',
    status: 'Pending',
    requestedBy: req.user._id,
    requestedDate: new Date(),
  });

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'LMS',
    entityType: 'LeaveEncashment',
    entityId: encashment._id,
    description: `Created leave encashment request: ${days} days of ${leaveType} for ${employee.employeeCode}`,
    changes: { created: req.body },
  });

  res.status(201).json({
    success: true,
    data: encashment,
  });
});

/**
 * Approve leave encashment
 */
exports.approveLeaveEncashment = asyncHandler(async (req, res) => {
  const encashment = await LeaveEncashment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    status: 'Pending',
  });

  if (!encashment) {
    return res.status(404).json({
      success: false,
      message: 'Leave encashment not found or already processed',
    });
  }

  // Update leave balance
  const leaveBalance = await LeaveBalance.findOne({
    tenantId: req.tenantId,
    employeeId: encashment.employeeId,
    leaveType: encashment.leaveType,
    financialYear: encashment.financialYear,
  });

  if (leaveBalance) {
    leaveBalance.used += encashment.days;
    leaveBalance.currentBalance = leaveBalance.openingBalance + leaveBalance.accrued - leaveBalance.used;
    await leaveBalance.save();
  }

  encashment.status = 'Approved';
  encashment.approvedBy = req.user._id;
  encashment.approvedDate = new Date();
  if (req.body.remarks) {
    encashment.remarks = req.body.remarks;
  }
  await encashment.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'APPROVE',
    module: 'LMS',
    entityType: 'LeaveEncashment',
    entityId: encashment._id,
    description: `Approved leave encashment: ${encashment.days} days`,
    changes: { approved: true },
  });

  res.status(200).json({
    success: true,
    data: encashment,
  });
});

/**
 * Process leave encashment payment
 */
exports.processLeaveEncashment = asyncHandler(async (req, res) => {
  const encashment = await LeaveEncashment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    status: 'Approved',
  });

  if (!encashment) {
    return res.status(404).json({
      success: false,
      message: 'Leave encashment not found or not approved',
    });
  }

  encashment.status = 'Processed';
  encashment.processedBy = req.user._id;
  encashment.processedDate = new Date();
  
  if (req.body.paymentDate) {
    encashment.paymentDate = new Date(req.body.paymentDate);
  }
  
  if (req.body.paymentReference) {
    encashment.paymentReference = req.body.paymentReference;
  }

  await encashment.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'PROCESS',
    module: 'LMS',
    entityType: 'LeaveEncashment',
    entityId: encashment._id,
    description: `Processed leave encashment payment: ₹${encashment.encashmentAmount}`,
    changes: { processed: true },
  });

  res.status(200).json({
    success: true,
    data: encashment,
  });
});

/**
 * Reject leave encashment
 */
exports.rejectLeaveEncashment = asyncHandler(async (req, res) => {
  const encashment = await LeaveEncashment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    status: 'Pending',
  });

  if (!encashment) {
    return res.status(404).json({
      success: false,
      message: 'Leave encashment not found or already processed',
    });
  }

  encashment.status = 'Rejected';
  if (req.body.remarks) {
    encashment.remarks = req.body.remarks;
  }
  await encashment.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'REJECT',
    module: 'LMS',
    entityType: 'LeaveEncashment',
    entityId: encashment._id,
    description: `Rejected leave encashment request`,
    changes: { rejected: true, remarks: req.body.remarks },
  });

  res.status(200).json({
    success: true,
    data: encashment,
  });
});

/**
 * Update leave encashment
 */
exports.updateLeaveEncashment = asyncHandler(async (req, res) => {
  const encashment = await LeaveEncashment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!encashment) {
    return res.status(404).json({
      success: false,
      message: 'Leave encashment not found',
    });
  }

  // Only allow updates if status is Pending
  if (encashment.status !== 'Pending') {
    return res.status(400).json({
      success: false,
      message: 'Cannot update encashment that is not pending',
    });
  }

  Object.assign(encashment, req.body);
  
  // Recalculate amount if days or dailyRate changed
  if (req.body.days || req.body.dailyRate) {
    encashment.encashmentAmount = (encashment.days || req.body.days) * (encashment.dailyRate || req.body.dailyRate);
  }

  await encashment.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    module: 'LMS',
    entityType: 'LeaveEncashment',
    entityId: encashment._id,
    description: `Updated leave encashment`,
    changes: { updated: req.body },
  });

  res.status(200).json({
    success: true,
    data: encashment,
  });
});

/**
 * Delete leave encashment
 */
exports.deleteLeaveEncashment = asyncHandler(async (req, res) => {
  const encashment = await LeaveEncashment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    status: 'Pending',
  });

  if (!encashment) {
    return res.status(404).json({
      success: false,
      message: 'Leave encashment not found or cannot be deleted',
    });
  }

  await encashment.deleteOne();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'DELETE',
    module: 'LMS',
    entityType: 'LeaveEncashment',
    entityId: req.params.id,
    description: `Deleted leave encashment request`,
    changes: { deleted: encashment.toObject() },
  });

  res.status(200).json({
    success: true,
    message: 'Leave encashment deleted successfully',
  });
});
