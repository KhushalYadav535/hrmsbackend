const Goal = require('../models/Goal');
const AppraisalCycle = require('../models/AppraisalCycle');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get all goals
 * BRD Requirement: BR-AMS-002
 */
exports.getGoals = asyncHandler(async (req, res) => {
  const { employeeId, appraisalCycleId, goalLevel, status, departmentId } = req.query;
  const filter = { tenantId: req.tenantId };

  if (employeeId) filter.employeeId = employeeId;
  if (appraisalCycleId) filter.appraisalCycleId = appraisalCycleId;
  if (goalLevel) filter.goalLevel = goalLevel;
  if (status) filter.status = status;
  if (departmentId) filter.departmentId = departmentId;

  // Employee sees only their goals
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({
      email: req.user.email,
      tenantId: req.tenantId,
    });
    if (employee) filter.employeeId = employee._id;
  }

  const goals = await Goal.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('appraisalCycleId', 'cycleName cycleType')
    .populate('parentGoalId', 'description kpi target')
    .populate('departmentId', 'name')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: goals.length,
    data: goals,
  });
});

/**
 * Create goal
 */
exports.createGoal = asyncHandler(async (req, res) => {
  const { appraisalCycleId, employeeId, parentGoalId, weightage } = req.body;

  // Validate appraisal cycle exists
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

  // Check total weightage for employee in this cycle
  if (employeeId && weightage) {
    const existingGoals = await Goal.find({
      tenantId: req.tenantId,
      employeeId,
      appraisalCycleId,
      status: { $ne: 'Cancelled' },
    });

    const totalWeightage = existingGoals.reduce((sum, g) => sum + (g.weightage || 0), 0);
    if (totalWeightage + weightage > 100) {
      return res.status(400).json({
        success: false,
        message: `Total weightage cannot exceed 100%. Current: ${totalWeightage}%, Adding: ${weightage}%`,
      });
    }
  }

  const goal = await Goal.create({
    ...req.body,
    tenantId: req.tenantId,
  });

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'AMS',
    entityType: 'Goal',
    entityId: goal._id,
    description: `Created goal: ${goal.description}`,
    changes: { created: req.body },
  });

  res.status(201).json({
    success: true,
    data: goal,
  });
});

/**
 * Update goal
 */
exports.updateGoal = asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!goal) {
    return res.status(404).json({
      success: false,
      message: 'Goal not found',
    });
  }

  // If modifying approved goal, require approval
  if (goal.status === 'Approved' && req.body.description) {
    goal.wasModified = true;
    goal.modificationReason = req.body.modificationReason || 'Goal modification requested';
    goal.status = 'Modified';
  }

  Object.assign(goal, req.body);
  await goal.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    module: 'AMS',
    entityType: 'Goal',
    entityId: goal._id,
    description: `Updated goal: ${goal.description}`,
    changes: { updated: req.body },
  });

  res.status(200).json({
    success: true,
    data: goal,
  });
});

/**
 * Approve goal
 */
exports.approveGoal = asyncHandler(async (req, res) => {
  const { comments } = req.body;

  const goal = await Goal.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    status: { $in: ['Submitted', 'Modified'] },
  });

  if (!goal) {
    return res.status(404).json({
      success: false,
      message: 'Goal not found or already approved',
    });
  }

  goal.status = 'Approved';
  goal.approvedDate = new Date();
  goal.approvedBy = req.user._id;
  goal.approvalComments = comments;
  await goal.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'APPROVE',
    module: 'AMS',
    entityType: 'Goal',
    entityId: goal._id,
    description: `Approved goal: ${goal.description}`,
    changes: { approved: true, comments },
  });

  res.status(200).json({
    success: true,
    data: goal,
  });
});

/**
 * Update goal progress
 */
exports.updateGoalProgress = asyncHandler(async (req, res) => {
  const { progress, currentValue } = req.body;

  const goal = await Goal.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!goal) {
    return res.status(404).json({
      success: false,
      message: 'Goal not found',
    });
  }

  goal.progress = progress || goal.progress;
  if (currentValue) goal.currentValue = currentValue;
  if (progress === 100) goal.status = 'Completed';
  await goal.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE_PROGRESS',
    module: 'AMS',
    entityType: 'Goal',
    entityId: goal._id,
    description: `Updated goal progress: ${progress}%`,
    changes: { progress, currentValue },
  });

  res.status(200).json({
    success: true,
    data: goal,
  });
});
