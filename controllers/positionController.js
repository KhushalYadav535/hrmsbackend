const Position = require('../models/Position');
const Employee = require('../models/Employee');
const OrganizationUnit = require('../models/OrganizationUnit');
const Job = require('../models/Job');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * @desc    Get all positions
 * @route   GET /api/positions
 * @access  Private
 */
exports.getPositions = asyncHandler(async (req, res) => {
  const { status, postingUnitId, designation, department } = req.query;
  
  const filter = { tenantId: req.tenantId };
  
  if (status) filter.status = status;
  if (postingUnitId) filter.postingUnitId = postingUnitId;
  if (designation) filter.designation = designation;
  if (department) filter.department = department;

  const positions = await Position.find(filter)
    .populate('postingUnitId', 'unitCode unitName unitType')
    .populate('designation', 'name')
    .populate('grade', 'name')
    .populate('currentEmployeeId', 'firstName lastName employeeCode')
    .populate('locationId', 'name city state')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: positions.length,
    data: positions,
  });
});

/**
 * @desc    Get single position
 * @route   GET /api/positions/:id
 * @access  Private
 */
exports.getPosition = asyncHandler(async (req, res) => {
  const position = await Position.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('postingUnitId', 'unitCode unitName unitType state city')
    .populate('designation', 'name')
    .populate('grade', 'name')
    .populate('currentEmployeeId', 'firstName lastName employeeCode email')
    .populate('locationId', 'name city state')
    .populate('jobPostingId', 'title status');

  if (!position) {
    return res.status(404).json({
      success: false,
      message: 'Position not found',
    });
  }

  res.status(200).json({
    success: true,
    data: position,
  });
});

/**
 * @desc    Create position
 * @route   POST /api/positions
 * @access  Private (Tenant Admin, HR Administrator)
 */
exports.createPosition = asyncHandler(async (req, res) => {
  const {
    positionCode,
    title,
    designation,
    grade,
    department,
    postingUnitId,
    locationId,
    reportingManagerId,
    minExperience,
    minSalary,
    maxSalary,
    description,
    requirements,
  } = req.body;

  if (!positionCode || !title || !designation || !department || !postingUnitId) {
    return res.status(400).json({
      success: false,
      message: 'Position code, title, designation, department, and posting unit are required',
    });
  }

  // Validate posting unit exists
  const unit = await OrganizationUnit.findOne({
    _id: postingUnitId,
    tenantId: req.tenantId,
    isActive: true,
  });

  if (!unit) {
    return res.status(400).json({
      success: false,
      message: 'Posting unit not found or inactive',
    });
  }

  // Auto-link location from branch if not provided
  let finalLocationId = locationId;
  if (!finalLocationId && unit.unitType === 'BRANCH') {
    const Location = require('../models/Location');
    const branchLocation = await Location.findOne({
      tenantId: req.tenantId,
      branchId: postingUnitId,
      status: 'Active',
    });
    if (branchLocation) {
      finalLocationId = branchLocation._id;
    }
  }

  const position = await Position.create({
    tenantId: req.tenantId,
    positionCode: positionCode.toUpperCase().trim(),
    title,
    designation,
    grade,
    department,
    postingUnitId,
    locationId: finalLocationId,
    reportingManagerId,
    minExperience: minExperience || 0,
    minSalary,
    maxSalary,
    status: 'Vacant',
    vacancyDate: new Date(),
    description,
    requirements,
  });

  await position.populate('postingUnitId', 'unitCode unitName unitType');
  await position.populate('designation', 'name');

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || 'System',
    userEmail: req.user.email,
    action: 'Create',
    module: 'Positions',
    entityType: 'Position',
    entityId: position._id,
    details: `Created position: ${position.positionCode} - ${position.title} at ${unit.unitCode}`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    message: 'Position created successfully',
    data: position,
  });
});

/**
 * @desc    Fill position (assign employee)
 * @route   POST /api/positions/:id/fill
 * @access  Private (Tenant Admin, HR Administrator)
 */
exports.fillPosition = asyncHandler(async (req, res) => {
  const { employeeId, startDate, reason } = req.body;

  if (!employeeId || !startDate) {
    return res.status(400).json({
      success: false,
      message: 'Employee ID and start date are required',
    });
  }

  const position = await Position.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!position) {
    return res.status(404).json({
      success: false,
      message: 'Position not found',
    });
  }

  if (position.status === 'Filled') {
    return res.status(400).json({
      success: false,
      message: 'Position is already filled',
    });
  }

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

  // Update position
  position.status = 'Filled';
  position.currentEmployeeId = employeeId;
  position.filledDate = new Date(startDate);
  
  // Add to position history
  if (!position.positionHistory) {
    position.positionHistory = [];
  }
  position.positionHistory.push({
    employeeId,
    startDate: new Date(startDate),
    reason: reason || 'Position filled',
    changedBy: req.user._id,
    changedAt: new Date(),
  });

  await position.save();

  // Update employee posting unit if different
  if (employee.postingUnitId?.toString() !== position.postingUnitId.toString()) {
    if (!employee.transferHistory) {
      employee.transferHistory = [];
    }
    employee.transferHistory.push({
      fromUnitId: employee.postingUnitId,
      toUnitId: position.postingUnitId,
      effectiveDate: new Date(startDate),
      transferType: 'Permanent',
      reason: reason || `Assigned to position ${position.positionCode}`,
      changedBy: req.user._id,
      changedAt: new Date(),
    });
    employee.postingUnitId = position.postingUnitId;
    if (position.locationId) {
      employee.location = position.locationId;
    }
    await employee.save();
  }

  // Update linked job posting if exists
  if (position.jobPostingId) {
    const job = await Job.findById(position.jobPostingId);
    if (job) {
      job.filledPositions = (job.filledPositions || 0) + 1;
      if (job.filledPositions >= job.openPositions) {
        job.status = 'Filled';
      }
      await job.save();
    }
  }

  res.status(200).json({
    success: true,
    message: 'Position filled successfully',
    data: position,
  });
});

/**
 * @desc    Vacate position (employee left/transferred)
 * @route   POST /api/positions/:id/vacate
 * @access  Private (Tenant Admin, HR Administrator)
 */
exports.vacatePosition = asyncHandler(async (req, res) => {
  const { endDate, reason } = req.body;

  const position = await Position.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!position) {
    return res.status(404).json({
      success: false,
      message: 'Position not found',
    });
  }

  if (position.status !== 'Filled') {
    return res.status(400).json({
      success: false,
      message: 'Position is not filled',
    });
  }

  // Update position history
  if (position.positionHistory && position.positionHistory.length > 0) {
    const currentRecord = position.positionHistory[position.positionHistory.length - 1];
    if (currentRecord.employeeId && !currentRecord.endDate) {
      currentRecord.endDate = new Date(endDate || Date.now());
      currentRecord.reason = reason || 'Position vacated';
    }
  }

  position.status = 'Vacant';
  position.vacancyDate = new Date(endDate || Date.now());
  const previousEmployeeId = position.currentEmployeeId;
  position.currentEmployeeId = null;
  await position.save();

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || 'System',
    userEmail: req.user.email,
    action: 'Update',
    module: 'Positions',
    entityType: 'Position',
    entityId: position._id,
    details: `Position vacated: ${position.positionCode}. Previous employee: ${previousEmployeeId}`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'Position vacated successfully',
    data: position,
  });
});

/**
 * @desc    Get vacant positions by branch
 * @route   GET /api/positions/vacant/by-branch
 * @access  Private
 */
exports.getVacantPositionsByBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.query;

  const filter = {
    tenantId: req.tenantId,
    status: 'Vacant',
  };

  if (branchId) {
    filter.postingUnitId = branchId;
  }

  const positions = await Position.find(filter)
    .populate('postingUnitId', 'unitCode unitName unitType city state')
    .populate('designation', 'name')
    .populate('grade', 'name')
    .populate('locationId', 'name city state')
    .sort({ postingUnitId: 1, designation: 1 });

  // Group by branch
  const groupedByBranch = {};
  positions.forEach(pos => {
    const branchCode = pos.postingUnitId?.unitCode || 'Unknown';
    if (!groupedByBranch[branchCode]) {
      groupedByBranch[branchCode] = {
        branch: pos.postingUnitId,
        positions: [],
      };
    }
    groupedByBranch[branchCode].positions.push(pos);
  });

  res.status(200).json({
    success: true,
    count: positions.length,
    data: Object.values(groupedByBranch),
  });
});

/**
 * @desc    Get branch-wise position summary
 * @route   GET /api/positions/summary/by-branch
 * @access  Private
 */
exports.getBranchPositionSummary = asyncHandler(async (req, res) => {
  const { branchId } = req.query;

  const filter = { tenantId: req.tenantId };
  if (branchId) {
    filter.postingUnitId = branchId;
  }

  const positions = await Position.find(filter)
    .populate('postingUnitId', 'unitCode unitName unitType');

  // Aggregate by branch
  const summary = {};
  positions.forEach(pos => {
    const branchCode = pos.postingUnitId?.unitCode || 'Unknown';
    if (!summary[branchCode]) {
      summary[branchCode] = {
        branch: pos.postingUnitId,
        total: 0,
        vacant: 0,
        filled: 0,
        onHold: 0,
      };
    }
    summary[branchCode].total++;
    summary[branchCode][pos.status.toLowerCase()] = (summary[branchCode][pos.status.toLowerCase()] || 0) + 1;
  });

  res.status(200).json({
    success: true,
    data: Object.values(summary),
  });
});
