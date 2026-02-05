const Feedback = require('../models/Feedback');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get feedbacks
 * BRD Requirement: BR-AMS-003
 */
exports.getFeedbacks = asyncHandler(async (req, res) => {
  const { employeeId, fromUserId, feedbackType, goalId } = req.query;
  const filter = { tenantId: req.tenantId };

  if (employeeId) filter.employeeId = employeeId;
  if (fromUserId) filter.fromUserId = fromUserId;
  if (feedbackType) filter.feedbackType = feedbackType;
  if (goalId) filter.goalId = goalId;

  // Employee sees feedbacks about them
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({
      email: req.user.email,
      tenantId: req.tenantId,
    });
    if (employee) filter.employeeId = employee._id;
  }

  const feedbacks = await Feedback.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('fromUserId', 'name email')
    .populate('goalId', 'description kpi')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: feedbacks.length,
    data: feedbacks,
  });
});

/**
 * Create feedback
 */
exports.createFeedback = asyncHandler(async (req, res) => {
  const { employeeId, feedbackType, feedback, visibility, goalId } = req.body;

  const employee = await Employee.findById(employeeId);
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  // Determine fromUserRole based on relationship
  let fromUserRole = 'Peer';
  if (employee.reportingManager?.toString() === req.user._id.toString()) {
    fromUserRole = 'Manager';
  }

  const feedbackDoc = await Feedback.create({
    ...req.body,
    tenantId: req.tenantId,
    fromUserId: req.user._id,
    fromUserRole,
    status: 'Published',
  });

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'AMS',
    entityType: 'Feedback',
    entityId: feedbackDoc._id,
    description: `Created feedback`,
    changes: { created: req.body },
  });

  res.status(201).json({
    success: true,
    data: feedbackDoc,
  });
});
