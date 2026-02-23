const Shift = require('../models/Shift');
const EmployeeShift = require('../models/EmployeeShift');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * Shift Management Controller
 * BRD: BR-P1-002 - Attendance Enhancements
 */

// @desc    Get all shifts
// @route   GET /api/shifts
// @access  Private (HR Administrator, Tenant Admin)
exports.getShifts = asyncHandler(async (req, res) => {
  const shifts = await Shift.find({ tenantId: req.tenantId, isActive: true })
    .sort({ shiftName: 1 })
    .lean();

  res.json({
    success: true,
    data: shifts,
  });
});

// @desc    Create shift
// @route   POST /api/shifts
// @access  Private (HR Administrator, Tenant Admin)
exports.createShift = asyncHandler(async (req, res) => {
  const {
    shiftCode,
    shiftName,
    shiftType,
    startTime,
    endTime,
    gracePeriod,
    halfDayCutoff,
    totalHours,
    breakDuration,
    nightShiftAllowance,
    flexibleShift,
    description,
  } = req.body;

  // Check if shift code already exists
  const existing = await Shift.findOne({ tenantId: req.tenantId, shiftCode });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: 'Shift code already exists',
    });
  }

  const shift = await Shift.create({
    tenantId: req.tenantId,
    shiftCode,
    shiftName,
    shiftType,
    startTime,
    endTime,
    gracePeriod: gracePeriod || 15,
    halfDayCutoff,
    totalHours: totalHours || 8,
    breakDuration: breakDuration || 60,
    nightShiftAllowance: nightShiftAllowance || 0,
    flexibleShift,
    description,
  });

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Create Shift',
    module: 'Attendance',
    entityType: 'Shift',
    entityId: shift._id,
    details: `Created shift: ${shiftName} (${shiftCode})`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    data: shift,
  });
});

// @desc    Assign shift to employee
// @route   POST /api/shifts/assign
// @access  Private (HR Administrator, Tenant Admin)
exports.assignShift = asyncHandler(async (req, res) => {
  const { employeeId, shiftId, effectiveDate, endDate, remarks } = req.body;

  const employee = await Employee.findOne({ tenantId: req.tenantId, _id: employeeId });
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  const shift = await Shift.findOne({ tenantId: req.tenantId, _id: shiftId });
  if (!shift) {
    return res.status(404).json({
      success: false,
      message: 'Shift not found',
    });
  }

  // Deactivate previous shift assignment
  await EmployeeShift.updateMany(
    { tenantId: req.tenantId, employeeId, isActive: true },
    { isActive: false, endDate: effectiveDate || new Date() }
  );

  const assignment = await EmployeeShift.create({
    tenantId: req.tenantId,
    employeeId,
    shiftId,
    effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
    endDate: endDate ? new Date(endDate) : null,
    assignedBy: req.user._id,
    remarks,
  });

  await assignment.populate('shiftId', 'shiftName shiftCode');

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Assign Shift',
    module: 'Attendance',
    entityType: 'EmployeeShift',
    entityId: assignment._id,
    details: `Assigned shift ${shift.shiftName} to ${employee.firstName} ${employee.lastName}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    data: assignment,
  });
});

// @desc    Get employee's current shift
// @route   GET /api/shifts/employee/:employeeId
// @access  Private
exports.getEmployeeShift = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;

  const assignment = await EmployeeShift.findOne({
    tenantId: req.tenantId,
    employeeId,
    isActive: true,
    $or: [
      { endDate: null },
      { endDate: { $gte: new Date() } },
    ],
  })
    .populate('shiftId')
    .sort({ effectiveDate: -1 })
    .lean();

  if (!assignment) {
    return res.status(404).json({
      success: false,
      message: 'No active shift assignment found',
    });
  }

  res.json({
    success: true,
    data: assignment,
  });
});

// @desc    Get shift roster
// @route   GET /api/shifts/roster
// @access  Private (HR Administrator, Tenant Admin)
exports.getShiftRoster = asyncHandler(async (req, res) => {
  const { month, year, department, location } = req.query;

  const startDate = new Date(year || new Date().getFullYear(), (month || new Date().getMonth()) - 1, 1);
  const endDate = new Date(year || new Date().getFullYear(), month || new Date().getMonth(), 0);

  const query = { tenantId: req.tenantId, isActive: true };
  if (department) query.department = department;
  if (location) query.location = location;

  const assignments = await EmployeeShift.find(query)
    .populate('employeeId', 'firstName lastName employeeCode department')
    .populate('shiftId', 'shiftName shiftCode startTime endTime')
    .lean();

  res.json({
    success: true,
    data: assignments,
    period: { startDate, endDate },
  });
});
