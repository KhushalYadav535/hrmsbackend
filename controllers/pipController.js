const PIP = require('../models/PIP');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/notificationService');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get PIPs
 * BRD Requirement: BR-AMS-009
 */
exports.getPIPs = asyncHandler(async (req, res) => {
  const { employeeId, managerId, status } = req.query;
  const filter = { tenantId: req.tenantId };

  if (employeeId) filter.employeeId = employeeId;
  if (managerId) filter.managerId = managerId;
  if (status) filter.status = status;

  // Employee sees only their PIPs
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({
      email: req.user.email,
      tenantId: req.tenantId,
    });
    if (employee) filter.employeeId = employee._id;
  }

  // Manager sees their team PIPs
  if (req.user.role === 'Manager' && !managerId) {
    filter.managerId = req.user._id;
  }

  const pips = await PIP.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('managerId', 'name email')
    .populate('appraisalCycleId', 'cycleName')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: pips.length,
    data: pips,
  });
});

/**
 * Create PIP
 */
exports.createPIP = asyncHandler(async (req, res) => {
  const { employeeId, performanceGaps, improvementGoals, actionPlan, endDate } = req.body;

  const employee = await Employee.findById(employeeId);
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  // Validate manager is reporting manager
  if (employee.reportingManager?.toString() !== req.user._id.toString() && req.user.role !== 'HR Administrator' && req.user.role !== 'Tenant Admin') {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to create PIP for this employee',
    });
  }

  // Calculate review milestones (every 30 days)
  const startDate = new Date(req.body.startDate || Date.now());
  const endDateObj = new Date(endDate);
  const milestones = [];
  let milestoneDate = new Date(startDate);
  milestoneDate.setDate(milestoneDate.getDate() + 30);

  while (milestoneDate <= endDateObj) {
    milestones.push({
      milestoneDate: new Date(milestoneDate),
      status: 'Scheduled',
    });
    milestoneDate.setDate(milestoneDate.getDate() + 30);
  }

  const pip = await PIP.create({
    ...req.body,
    tenantId: req.tenantId,
    managerId: req.user._id,
    reviewMilestones: milestones,
    status: 'Proposed',
    proposedDate: new Date(),
  });

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Create',
    module: 'AMS',
    entityType: 'PIP',
    entityId: pip._id,
    description: `Created PIP for employee`,
    changes: JSON.stringify({ created: req.body }),
  });

  res.status(201).json({
    success: true,
    data: pip,
  });
});

/**
 * Approve PIP (HR)
 */
exports.approvePIP = asyncHandler(async (req, res) => {
  const pip = await PIP.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    status: 'Proposed',
  }).populate('employeeId', 'firstName lastName email');

  if (!pip) {
    return res.status(404).json({
      success: false,
      message: 'PIP not found or already processed',
    });
  }

  pip.status = 'HR Approved';
  pip.hrApprovedDate = new Date();
  pip.hrApproverId = req.user._id;
  await pip.save();

  // Send notification to employee
  if (pip.employeeId && pip.employeeId.email) {
    await sendNotification({
      to: pip.employeeId.email,
      channels: ['email'],
      subject: 'Performance Improvement Plan (PIP) Initiated',
      message: `A Performance Improvement Plan has been initiated for you. Please review and acknowledge.`,
      tenantId: req.tenantId,
      userId: req.user._id,
      module: 'Appraisal Management',
      action: 'PIP Approved',
    });
  }

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Approve',
    module: 'AMS',
    entityType: 'PIP',
    entityId: pip._id,
    description: `Approved PIP`,
    changes: JSON.stringify({ approved: true }),
  });

  res.status(200).json({
    success: true,
    data: pip,
  });
});

/**
 * Employee acknowledge PIP
 */
exports.acknowledgePIP = asyncHandler(async (req, res) => {
  const { comments } = req.body;

  const employee = await Employee.findOne({
    email: req.user.email,
    tenantId: req.tenantId,
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found',
    });
  }

  const pip = await PIP.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    employeeId: employee._id,
    status: 'HR Approved',
  });

  if (!pip) {
    return res.status(404).json({
      success: false,
      message: 'PIP not found or not approved',
    });
  }

  pip.status = 'Employee Acknowledged';
  pip.employeeAcknowledgedDate = new Date();
  pip.employeeComments = comments;
  await pip.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'ACKNOWLEDGE',
    module: 'AMS',
    entityType: 'PIP',
    entityId: pip._id,
    description: `Employee acknowledged PIP`,
    changes: JSON.stringify({ acknowledged: true, comments }),
  });

  res.status(200).json({
    success: true,
    data: pip,
  });
});
