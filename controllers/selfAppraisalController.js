const SelfAppraisal = require('../models/SelfAppraisal');
const AppraisalCycle = require('../models/AppraisalCycle');
const Employee = require('../models/Employee');
const Goal = require('../models/Goal');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/notificationService');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get self appraisals
 * BRD Requirement: BR-AMS-004
 */
exports.getSelfAppraisals = asyncHandler(async (req, res) => {
  const { employeeId, appraisalCycleId, status } = req.query;
  const filter = { tenantId: req.tenantId };

  if (employeeId) filter.employeeId = employeeId;
  if (appraisalCycleId) filter.appraisalCycleId = appraisalCycleId;
  if (status) filter.status = status;

  // Employee sees only their appraisals
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({
      email: req.user.email,
      tenantId: req.tenantId,
    });
    if (employee) filter.employeeId = employee._id;
  }

  const selfAppraisals = await SelfAppraisal.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('appraisalCycleId', 'cycleName cycleType')
    .populate('goalAchievements.goalId', 'description kpi target weightage')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: selfAppraisals.length,
    data: selfAppraisals,
  });
});

/**
 * Create or update self appraisal
 */
exports.createOrUpdateSelfAppraisal = asyncHandler(async (req, res) => {
  const { appraisalCycleId, goalAchievements, overallSelfRating } = req.body;

  // Find employee
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

  // Validate appraisal cycle
  const cycle = await AppraisalCycle.findOne({
    _id: appraisalCycleId,
    tenantId: req.tenantId,
  });

  if (!cycle) {
    return res.status(404).json({
      success: false,
      message: 'Appraisal cycle not found',
    });
  }

  // Check if self-appraisal already exists
  let selfAppraisal = await SelfAppraisal.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    appraisalCycleId,
  });

  if (selfAppraisal && selfAppraisal.status === 'Locked') {
    return res.status(400).json({
      success: false,
      message: 'Self-appraisal is locked and cannot be modified',
    });
  }

  // Validate all goals belong to employee
  if (goalAchievements && goalAchievements.length > 0) {
    const goalIds = goalAchievements.map(ga => ga.goalId);
    const goals = await Goal.find({
      _id: { $in: goalIds },
      tenantId: req.tenantId,
      employeeId: employee._id,
      appraisalCycleId,
    });

    if (goals.length !== goalIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some goals do not belong to this employee',
      });
    }
  }

  if (selfAppraisal) {
    // Update existing
    Object.assign(selfAppraisal, req.body);
    await selfAppraisal.save();
  } else {
    // Create new
    selfAppraisal = await SelfAppraisal.create({
      ...req.body,
      tenantId: req.tenantId,
      employeeId: employee._id,
    });
  }

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: selfAppraisal.status === 'Draft' ? 'Update' : 'Create',
    module: 'AMS',
    entityType: 'SelfAppraisal',
    entityId: selfAppraisal._id,
    description: `Self-appraisal ${selfAppraisal.status === 'Draft' ? 'updated' : 'created'}`,
    changes: JSON.stringify({ updated: req.body }),
  });

  res.status(selfAppraisal.status === 'Draft' ? 200 : 201).json({
    success: true,
    data: selfAppraisal,
  });
});

/**
 * Submit self appraisal
 */
exports.submitSelfAppraisal = asyncHandler(async (req, res) => {
  const selfAppraisal = await SelfAppraisal.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  }).populate('employeeId', 'firstName lastName email reportingManager')
    .populate('appraisalCycleId');

  if (!selfAppraisal) {
    return res.status(404).json({
      success: false,
      message: 'Self-appraisal not found',
    });
  }

  if (selfAppraisal.status === 'Locked') {
    return res.status(400).json({
      success: false,
      message: 'Self-appraisal is already submitted and locked',
    });
  }

  // Validate all required fields
  if (!selfAppraisal.goalAchievements || selfAppraisal.goalAchievements.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Goal achievements are required',
    });
  }

  if (!selfAppraisal.overallSelfRating) {
    return res.status(400).json({
      success: false,
      message: 'Overall self-rating is required',
    });
  }

  selfAppraisal.status = 'Submitted';
  selfAppraisal.submittedDate = new Date();
  selfAppraisal.lockedDate = new Date();
  await selfAppraisal.save();

  // Send notification to manager
  if (selfAppraisal.employeeId.reportingManager) {
    // TODO: Get manager email and send notification
  }

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'SUBMIT',
    module: 'AMS',
    entityType: 'SelfAppraisal',
    entityId: selfAppraisal._id,
    description: `Submitted self-appraisal`,
    changes: JSON.stringify({ submitted: true }),
  });

  res.status(200).json({
    success: true,
    data: selfAppraisal,
    message: 'Self-appraisal submitted successfully',
  });
});
