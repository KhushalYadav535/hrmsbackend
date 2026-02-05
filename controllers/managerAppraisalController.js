const ManagerAppraisal = require('../models/ManagerAppraisal');
const SelfAppraisal = require('../models/SelfAppraisal');
const AppraisalCycle = require('../models/AppraisalCycle');
const Employee = require('../models/Employee');
const Goal = require('../models/Goal');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/notificationService');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get manager appraisals
 * BRD Requirement: BR-AMS-005
 */
exports.getManagerAppraisals = asyncHandler(async (req, res) => {
  const { employeeId, managerId, appraisalCycleId, status } = req.query;
  const filter = { tenantId: req.tenantId };

  if (employeeId) filter.employeeId = employeeId;
  if (managerId) filter.managerId = managerId;
  if (appraisalCycleId) filter.appraisalCycleId = appraisalCycleId;
  if (status) filter.status = status;

  // Manager sees their team appraisals
  if (req.user.role === 'Manager' && !managerId) {
    filter.managerId = req.user._id;
  }

  // Employee sees only their appraisals
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({
      email: req.user.email,
      tenantId: req.tenantId,
    });
    if (employee) filter.employeeId = employee._id;
  }

  const appraisals = await ManagerAppraisal.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode grade department')
    .populate('managerId', 'name email')
    .populate('appraisalCycleId', 'cycleName')
    .populate('goalRatings.goalId', 'description kpi target weightage')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: appraisals.length,
    data: appraisals,
  });
});

/**
 * Create manager appraisal
 */
exports.createManagerAppraisal = asyncHandler(async (req, res) => {
  const { employeeId, appraisalCycleId, goalRatings, competencyRatings, overallRating } = req.body;

  // Find employee
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

  // Verify manager is the reporting manager
  if (employee.reportingManager?.toString() !== req.user._id.toString() && req.user.role !== 'HR Administrator' && req.user.role !== 'Tenant Admin') {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to appraise this employee',
    });
  }

  // Check if self-appraisal exists and is submitted
  const selfAppraisal = await SelfAppraisal.findOne({
    tenantId: req.tenantId,
    employeeId,
    appraisalCycleId,
    status: 'Submitted',
  });

  if (!selfAppraisal) {
    return res.status(400).json({
      success: false,
      message: 'Self-appraisal must be submitted before manager appraisal',
    });
  }

  // Check if manager appraisal already exists
  const existing = await ManagerAppraisal.findOne({
    tenantId: req.tenantId,
    employeeId,
    appraisalCycleId,
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: 'Manager appraisal already exists for this cycle',
    });
  }

  // Get cycle for weightages
  const cycle = await AppraisalCycle.findById(appraisalCycleId);

  // Calculate scores
  let kpaScore = 0;
  if (goalRatings && goalRatings.length > 0) {
    // Get goal weightages
    const goalIds = goalRatings.map(gr => gr.goalId);
    const goals = await Goal.find({
      _id: { $in: goalIds },
      tenantId: req.tenantId,
    });

    let totalWeightedRating = 0;
    let totalWeightage = 0;

    goalRatings.forEach(gr => {
      const goal = goals.find(g => g._id.toString() === gr.goalId.toString());
      const weightage = goal?.weightage || 0;
      totalWeightedRating += gr.managerRating * weightage;
      totalWeightage += weightage;
    });

    kpaScore = totalWeightage > 0 ? totalWeightedRating / totalWeightage : 0;
  }

  // Calculate competency score
  let competencyScore = 0;
  if (competencyRatings) {
    const ratings = Object.values(competencyRatings).filter(v => v !== undefined && v !== null);
    if (ratings.length > 0) {
      competencyScore = ratings.reduce((sum, val) => sum + val, 0) / ratings.length;
    }
  }

  // Calculate overall rating based on weightages
  const kpaWeightage = cycle?.componentWeightages?.kpa || 70;
  const competencyWeightage = cycle?.componentWeightages?.competencies || 20;
  const valuesWeightage = cycle?.componentWeightages?.values || 10;

  const calculatedOverall = (kpaScore * kpaWeightage + competencyScore * competencyWeightage + (req.body.valuesRating || 3) * valuesWeightage) / 100;

  const managerAppraisal = await ManagerAppraisal.create({
    ...req.body,
    tenantId: req.tenantId,
    managerId: req.user._id,
    selfAppraisalId: selfAppraisal._id,
    kpaScore,
    competencyScore,
    valuesScore: req.body.valuesRating || 0,
    overallRating: overallRating || Math.round(calculatedOverall),
  });

  // Update self-appraisal goal ratings for comparison
  if (goalRatings) {
    goalRatings.forEach(gr => {
      const selfGoal = selfAppraisal.goalAchievements.find(ga => ga.goalId.toString() === gr.goalId.toString());
      if (selfGoal) {
        gr.selfRating = selfGoal.selfRating;
      }
    });
    managerAppraisal.goalRatings = goalRatings;
    await managerAppraisal.save();
  }

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'AMS',
    entityType: 'ManagerAppraisal',
    entityId: managerAppraisal._id,
    description: `Created manager appraisal for employee`,
    changes: { created: req.body },
  });

  res.status(201).json({
    success: true,
    data: managerAppraisal,
  });
});

/**
 * Submit manager appraisal
 */
exports.submitManagerAppraisal = asyncHandler(async (req, res) => {
  const managerAppraisal = await ManagerAppraisal.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    managerId: req.user._id,
  }).populate('employeeId', 'firstName lastName email');

  if (!managerAppraisal) {
    return res.status(404).json({
      success: false,
      message: 'Manager appraisal not found',
    });
  }

  if (managerAppraisal.status !== 'Draft') {
    return res.status(400).json({
      success: false,
      message: 'Appraisal is already submitted',
    });
  }

  managerAppraisal.status = 'Submitted';
  managerAppraisal.submittedDate = new Date();
  await managerAppraisal.save();

  // Send notification to employee
  if (managerAppraisal.employeeId && managerAppraisal.employeeId.email) {
    await sendNotification({
      to: managerAppraisal.employeeId.email,
      channels: ['email'],
      subject: `Manager Appraisal Completed - ${managerAppraisal.appraisalCycleId?.cycleName || 'Appraisal'}`,
      message: `Your manager has completed your performance appraisal. Overall rating: ${managerAppraisal.overallRating}/5`,
      tenantId: req.tenantId,
      userId: req.user._id,
      module: 'Appraisal Management',
      action: 'Manager Appraisal Submitted',
    });
  }

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'SUBMIT',
    module: 'AMS',
    entityType: 'ManagerAppraisal',
    entityId: managerAppraisal._id,
    description: `Submitted manager appraisal`,
    changes: { submitted: true },
  });

  res.status(200).json({
    success: true,
    data: managerAppraisal,
    message: 'Manager appraisal submitted successfully',
  });
});
