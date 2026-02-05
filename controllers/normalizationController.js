const Normalization = require('../models/Normalization');
const ManagerAppraisal = require('../models/ManagerAppraisal');
const AppraisalCycle = require('../models/AppraisalCycle');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get normalization records
 * BRD Requirement: BR-AMS-007
 */
exports.getNormalizations = asyncHandler(async (req, res) => {
  const { appraisalCycleId, departmentId, status } = req.query;
  const filter = { tenantId: req.tenantId };

  if (appraisalCycleId) filter.appraisalCycleId = appraisalCycleId;
  if (departmentId) filter.departmentId = departmentId;
  if (status) filter.status = status;

  const normalizations = await Normalization.find(filter)
    .populate('appraisalCycleId', 'cycleName')
    .populate('departmentId', 'name')
    .populate('ratingAdjustments.employeeId', 'firstName lastName employeeCode')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: normalizations.length,
    data: normalizations,
  });
});

/**
 * Create normalization for department/cycle
 */
exports.createNormalization = asyncHandler(async (req, res) => {
  const { appraisalCycleId, departmentId } = req.body;

  // Get cycle for target distribution
  const cycle = await AppraisalCycle.findById(appraisalCycleId);
  if (!cycle) {
    return res.status(404).json({
      success: false,
      message: 'Appraisal cycle not found',
    });
  }

  // Get all manager appraisals for this cycle and department
  const filter = {
    tenantId: req.tenantId,
    appraisalCycleId,
    status: 'Submitted',
  };
  if (departmentId) {
    const employees = await Employee.find({ tenantId: req.tenantId, department: departmentId }).select('_id');
    filter.employeeId = { $in: employees.map(e => e._id) };
  }

  const appraisals = await ManagerAppraisal.find(filter);

  // Calculate actual distribution
  const distribution = {
    exceptional: 0,
    exceeds: 0,
    meets: 0,
    needsImprovement: 0,
    unsatisfactory: 0,
  };

  appraisals.forEach(ap => {
    const rating = ap.overallRating || ap.normalizedRating || 0;
    if (rating === 5) distribution.exceptional++;
    else if (rating === 4) distribution.exceeds++;
    else if (rating === 3) distribution.meets++;
    else if (rating === 2) distribution.needsImprovement++;
    else if (rating === 1) distribution.unsatisfactory++;
  });

  const total = appraisals.length;
  const actualDistribution = {
    exceptional: total > 0 ? (distribution.exceptional / total) * 100 : 0,
    exceeds: total > 0 ? (distribution.exceeds / total) * 100 : 0,
    meets: total > 0 ? (distribution.meets / total) * 100 : 0,
    needsImprovement: total > 0 ? (distribution.needsImprovement / total) * 100 : 0,
    unsatisfactory: total > 0 ? (distribution.unsatisfactory / total) * 100 : 0,
  };

  const normalization = await Normalization.create({
    tenantId: req.tenantId,
    appraisalCycleId,
    departmentId,
    targetDistribution: cycle.bellCurveDistribution || {
      exceptional: 10,
      exceeds: 20,
      meets: 60,
      needsImprovement: 8,
      unsatisfactory: 2,
    },
    actualDistribution,
    status: 'Draft',
  });

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'AMS',
    entityType: 'Normalization',
    entityId: normalization._id,
    description: `Created normalization for cycle`,
    changes: { created: req.body },
  });

  res.status(201).json({
    success: true,
    data: normalization,
  });
});

/**
 * Adjust rating (normalize)
 */
exports.adjustRating = asyncHandler(async (req, res) => {
  const { employeeId, managerAppraisalId, normalizedRating, justification } = req.body;

  const normalization = await Normalization.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!normalization) {
    return res.status(404).json({
      success: false,
      message: 'Normalization record not found',
    });
  }

  const managerAppraisal = await ManagerAppraisal.findById(managerAppraisalId);
  if (!managerAppraisal) {
    return res.status(404).json({
      success: false,
      message: 'Manager appraisal not found',
    });
  }

  // Add or update rating adjustment
  const existingIndex = normalization.ratingAdjustments.findIndex(
    ra => ra.managerAppraisalId.toString() === managerAppraisalId
  );

  const adjustment = {
    employeeId,
    managerAppraisalId,
    originalRating: managerAppraisal.overallRating,
    normalizedRating,
    justification,
    adjustedBy: req.user._id,
    adjustedDate: new Date(),
  };

  if (existingIndex >= 0) {
    normalization.ratingAdjustments[existingIndex] = adjustment;
  } else {
    normalization.ratingAdjustments.push(adjustment);
  }

  // Update manager appraisal
  managerAppraisal.normalizedRating = normalizedRating;
  managerAppraisal.normalizedDate = new Date();
  managerAppraisal.normalizationComments = justification;
  managerAppraisal.status = 'Normalized';
  await managerAppraisal.save();

  await normalization.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'ADJUST_RATING',
    module: 'AMS',
    entityType: 'Normalization',
    entityId: normalization._id,
    description: `Adjusted rating for employee`,
    changes: { adjustment },
  });

  res.status(200).json({
    success: true,
    data: normalization,
  });
});

/**
 * Complete normalization
 */
exports.completeNormalization = asyncHandler(async (req, res) => {
  const normalization = await Normalization.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!normalization) {
    return res.status(404).json({
      success: false,
      message: 'Normalization record not found',
    });
  }

  normalization.status = 'Completed';
  normalization.completedDate = new Date();
  await normalization.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'COMPLETE',
    module: 'AMS',
    entityType: 'Normalization',
    entityId: normalization._id,
    description: `Completed normalization`,
    changes: { completed: true },
  });

  res.status(200).json({
    success: true,
    data: normalization,
  });
});
