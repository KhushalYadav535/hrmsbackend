const IDP = require('../models/IDP');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get IDPs
 * BRD Requirement: BR-AMS-011
 */
exports.getIDPs = asyncHandler(async (req, res) => {
  const { employeeId, managerId, status } = req.query;
  const filter = { tenantId: req.tenantId };

  if (employeeId) filter.employeeId = employeeId;
  if (managerId) filter.managerId = managerId;
  if (status) filter.status = status;

  // Employee sees only their IDPs
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({
      email: req.user.email,
      tenantId: req.tenantId,
    });
    if (employee) filter.employeeId = employee._id;
  }

  // Manager sees their team IDPs
  if (req.user.role === 'Manager' && !managerId) {
    filter.managerId = req.user._id;
  }

  const idps = await IDP.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('managerId', 'name email')
    .populate('mentorId', 'firstName lastName')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: idps.length,
    data: idps,
  });
});

/**
 * Create IDP
 */
exports.createIDP = asyncHandler(async (req, res) => {
  const { employeeId, skillGaps, trainingNeeds, shortTermGoals, longTermGoals } = req.body;

  const employee = await Employee.findById(employeeId);
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  // Calculate quarterly review dates
  const quarterlyReviews = [];
  const startDate = new Date();
  for (let i = 0; i < 4; i++) {
    const reviewDate = new Date(startDate);
    reviewDate.setMonth(reviewDate.getMonth() + (i + 1) * 3);
    quarterlyReviews.push({
      reviewDate,
      status: 'Scheduled',
    });
  }

  const idp = await IDP.create({
    ...req.body,
    tenantId: req.tenantId,
    managerId: req.user._id,
    quarterlyReviews,
    status: 'Draft',
  });

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'AMS',
    entityType: 'IDP',
    entityId: idp._id,
    description: `Created IDP for employee`,
    changes: { created: req.body },
  });

  res.status(201).json({
    success: true,
    data: idp,
  });
});

/**
 * Finalize IDP
 */
exports.finalizeIDP = asyncHandler(async (req, res) => {
  const idp = await IDP.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!idp) {
    return res.status(404).json({
      success: false,
      message: 'IDP not found',
    });
  }

  idp.status = 'Finalized';
  idp.finalizedDate = new Date();
  await idp.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'FINALIZE',
    module: 'AMS',
    entityType: 'IDP',
    entityId: idp._id,
    description: `Finalized IDP`,
    changes: { finalized: true },
  });

  res.status(200).json({
    success: true,
    data: idp,
  });
});
