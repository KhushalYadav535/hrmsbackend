const AppraisalCycle = require('../models/AppraisalCycle');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get all appraisal cycles
 * BRD Requirement: BR-AMS-001
 */
exports.getAppraisalCycles = asyncHandler(async (req, res) => {
  const { cycleType, status } = req.query;
  const filter = { tenantId: req.tenantId };

  if (cycleType) filter.cycleType = cycleType;
  if (status) filter.status = status;

  const cycles = await AppraisalCycle.find(filter)
    .populate('applicableDepartments', 'name')
    .sort({ startDate: -1 });

  res.status(200).json({
    success: true,
    count: cycles.length,
    data: cycles,
  });
});

/**
 * Get active appraisal cycle
 */
exports.getActiveCycle = asyncHandler(async (req, res) => {
  const currentDate = new Date();
  const activeCycle = await AppraisalCycle.findOne({
    tenantId: req.tenantId,
    status: 'Active',
    startDate: { $lte: currentDate },
    endDate: { $gte: currentDate },
  })
    .populate('applicableDepartments', 'name');

  if (!activeCycle) {
    return res.status(404).json({
      success: false,
      message: 'No active appraisal cycle found',
    });
  }

  res.status(200).json({
    success: true,
    data: activeCycle,
  });
});

/**
 * Create appraisal cycle
 */
exports.createAppraisalCycle = asyncHandler(async (req, res) => {
  const cycle = await AppraisalCycle.create({
    ...req.body,
    tenantId: req.tenantId,
  });

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'AMS',
    entityType: 'AppraisalCycle',
    entityId: cycle._id,
    description: `Created appraisal cycle: ${cycle.cycleName}`,
    changes: { created: req.body },
  });

  res.status(201).json({
    success: true,
    data: cycle,
  });
});

/**
 * Update appraisal cycle
 */
exports.updateAppraisalCycle = asyncHandler(async (req, res) => {
  const cycle = await AppraisalCycle.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!cycle) {
    return res.status(404).json({
      success: false,
      message: 'Appraisal cycle not found',
    });
  }

  Object.assign(cycle, req.body);
  await cycle.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    module: 'AMS',
    entityType: 'AppraisalCycle',
    entityId: cycle._id,
    description: `Updated appraisal cycle: ${cycle.cycleName}`,
    changes: { updated: req.body },
  });

  res.status(200).json({
    success: true,
    data: cycle,
  });
});

/**
 * Activate appraisal cycle
 */
exports.activateCycle = asyncHandler(async (req, res) => {
  const cycle = await AppraisalCycle.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!cycle) {
    return res.status(404).json({
      success: false,
      message: 'Appraisal cycle not found',
    });
  }

  // Deactivate other active cycles
  await AppraisalCycle.updateMany(
    {
      tenantId: req.tenantId,
      status: 'ACTIVE',
      _id: { $ne: cycle._id },
    },
    { status: 'CLOSED' }
  );

  cycle.status = 'ACTIVE';
  await cycle.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'ACTIVATE',
    module: 'AMS',
    entityType: 'AppraisalCycle',
    entityId: cycle._id,
    description: `Activated appraisal cycle: ${cycle.cycleName}`,
    changes: { activated: true },
  });

  res.status(200).json({
    success: true,
    data: cycle,
  });
});
