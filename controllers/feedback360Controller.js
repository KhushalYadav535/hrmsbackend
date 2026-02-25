const Feedback360 = require('../models/Feedback360');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get 360-degree feedbacks
 * BRD Requirement: BR-AMS-012
 */
exports.getFeedback360s = asyncHandler(async (req, res) => {
  const { employeeId, appraisalCycleId, status } = req.query;
  const filter = { tenantId: req.tenantId };

  if (employeeId) filter.employeeId = employeeId;
  if (appraisalCycleId) filter.appraisalCycleId = appraisalCycleId;
  if (status) filter.status = status;

  // Employee sees only their 360 feedbacks
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({
      email: req.user.email,
      tenantId: req.tenantId,
    });
    if (employee) filter.employeeId = employee._id;
  }

  const feedbacks360 = await Feedback360.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('appraisalCycleId', 'cycleName')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: feedbacks360.length,
    data: feedbacks360,
  });
});

/**
 * Create 360-degree feedback
 */
exports.createFeedback360 = asyncHandler(async (req, res) => {
  const { employeeId, appraisalCycleId } = req.body;

  const employee = await Employee.findById(employeeId);
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  const feedback360 = await Feedback360.create({
    ...req.body,
    tenantId: req.tenantId,
    status: 'Draft',
  });

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Create',
    module: 'AMS',
    entityType: 'Feedback360',
    entityId: feedback360._id,
    description: `Created 360-degree feedback`,
    changes: JSON.stringify({ created: req.body }),
  });

  res.status(201).json({
    success: true,
    data: feedback360,
  });
});

/**
 * Submit peer feedback
 */
exports.submitPeerFeedback = asyncHandler(async (req, res) => {
  const { employeeId, competencyRatings, comments } = req.body;

  const feedback360 = await Feedback360.findOne({
    tenantId: req.tenantId,
    employeeId,
  });

  if (!feedback360) {
    return res.status(404).json({
      success: false,
      message: '360-degree feedback record not found',
    });
  }

  // Add peer feedback
  feedback360.peerFeedbacks.push({
    raterId: req.user._id,
    raterName: req.user.name || req.user.email,
    anonymous: true,
    competencyRatings,
    comments,
    submittedDate: new Date(),
  });

  await feedback360.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'SUBMIT_PEER_FEEDBACK',
    module: 'AMS',
    entityType: 'Feedback360',
    entityId: feedback360._id,
    description: `Submitted peer feedback`,
    changes: JSON.stringify({ peerFeedback: true }),
  });

  res.status(200).json({
    success: true,
    data: feedback360,
  });
});
