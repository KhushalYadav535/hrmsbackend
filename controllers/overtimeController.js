const Overtime = require('../models/Overtime');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * Overtime Management Controller
 * BRD: BR-P1-002 - Attendance Enhancements
 */

// @desc    Request OT (pre-approval)
// @route   POST /api/overtime/request
// @access  Private (Employee)
exports.requestOvertime = asyncHandler(async (req, res) => {
  const { date, requestedHours, reason, otType } = req.body;

  const employee = await Employee.findOne({
    tenantId: req.tenantId,
    _id: req.user.employeeId,
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  // Check OT limits
  const monthStart = new Date(date);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const monthlyOT = await Overtime.aggregate([
    {
      $match: {
        tenantId: req.tenantId,
        employeeId: employee._id,
        date: { $gte: monthStart, $lt: monthEnd },
        status: { $in: ['APPROVED', 'PAID'] },
      },
    },
    {
      $group: {
        _id: null,
        totalHours: { $sum: '$actualHours' },
      },
    },
  ]);

  const totalMonthlyOT = monthlyOT[0]?.totalHours || 0;
  if (totalMonthlyOT + requestedHours > 40) {
    return res.status(400).json({
      success: false,
      message: `Monthly OT limit exceeded. Current: ${totalMonthlyOT} hours, Requested: ${requestedHours} hours. Maximum allowed: 40 hours/month`,
    });
  }

  // Calculate OT rate based on type
  const otRates = {
    WEEKDAY: 1.5,
    WEEKEND: 2.0,
    HOLIDAY: 2.5,
  };
  const otRate = otRates[otType] || 1.5;

  // Calculate hourly rate (Basic / 26 / 8)
  const hourlyRate = employee.salary / 26 / 8;

  const overtime = await Overtime.create({
    tenantId: req.tenantId,
    employeeId: employee._id,
    date: new Date(date),
    requestType: 'PRE_APPROVAL',
    requestedHours,
    actualHours: requestedHours, // Will be updated when actual hours are known
    otType: otType || 'WEEKDAY',
    otRate,
    hourlyRate,
    reason,
    requestedBy: req.user._id,
    status: 'PENDING',
  });

  await overtime.populate('employeeId', 'firstName lastName employeeCode');

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Request Overtime',
    module: 'Attendance',
    entityType: 'Overtime',
    entityId: overtime._id,
    details: `Requested ${requestedHours} hours OT for ${date}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    data: overtime,
  });
});

// @desc    Approve/reject OT request
// @route   PATCH /api/overtime/:id/approve
// @access  Private (Manager, HR Administrator)
exports.approveOvertime = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, rejectionReason, actualHours } = req.body;

  const overtime = await Overtime.findById(id);
  if (!overtime || overtime.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'OT request not found',
    });
  }

  if (action === 'APPROVE') {
    overtime.status = 'APPROVED';
    overtime.approvedBy = req.user._id;
    overtime.approvedDate = new Date();
    if (actualHours) {
      overtime.actualHours = actualHours;
      // Recalculate OT amount
      overtime.otAmount = actualHours * overtime.hourlyRate * overtime.otRate;
    }
  } else if (action === 'REJECT') {
    overtime.status = 'REJECTED';
    overtime.rejectionReason = rejectionReason;
  }

  await overtime.save();

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: `${action} Overtime`,
    module: 'Attendance',
    entityType: 'Overtime',
    entityId: overtime._id,
    details: `${action} OT request for ${overtime.date}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.json({
    success: true,
    data: overtime,
  });
});

// @desc    Auto-detect OT from attendance
// @route   POST /api/overtime/auto-detect
// @access  Private (System/HR Administrator)
exports.autoDetectOvertime = asyncHandler(async (req, res) => {
  const { employeeId, date } = req.body;

  const attendance = await Attendance.findOne({
    tenantId: req.tenantId,
    employeeId,
    date: new Date(date),
  });

  if (!attendance || !attendance.checkIn || !attendance.checkOut) {
    return res.status(404).json({
      success: false,
      message: 'Attendance record not found or incomplete',
    });
  }

  const employee = await Employee.findById(employeeId);
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  // Get employee's shift
  const EmployeeShift = require('../models/EmployeeShift');
  const Shift = require('../models/Shift');
  
  const shiftAssignment = await EmployeeShift.findOne({
    tenantId: req.tenantId,
    employeeId,
    isActive: true,
  }).populate('shiftId');

  if (!shiftAssignment || !shiftAssignment.shiftId) {
    return res.status(400).json({
      success: false,
      message: 'Employee shift not assigned',
    });
  }

  const shift = shiftAssignment.shiftId;
  const scheduledHours = shift.totalHours || 8;
  const actualHours = attendance.workingHours || 0;

  if (actualHours <= scheduledHours) {
    return res.json({
      success: true,
      message: 'No overtime detected',
      data: null,
    });
  }

  const otHours = actualHours - scheduledHours;

  // Determine OT type (WEEKDAY/WEEKEND/HOLIDAY)
  const dayOfWeek = new Date(date).getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  // TODO: Check if holiday from HolidayCalendar
  const isHoliday = false;

  let otType = 'WEEKDAY';
  if (isHoliday) {
    otType = 'HOLIDAY';
  } else if (isWeekend) {
    otType = 'WEEKEND';
  }

  const otRates = {
    WEEKDAY: 1.5,
    WEEKEND: 2.0,
    HOLIDAY: 2.5,
  };
  const otRate = otRates[otType];

  const hourlyRate = employee.salary / 26 / 8;
  const otAmount = otHours * hourlyRate * otRate;

  // Check if OT already exists
  const existingOT = await Overtime.findOne({
    tenantId: req.tenantId,
    employeeId,
    date: new Date(date),
  });

  if (existingOT) {
    existingOT.actualHours = otHours;
    existingOT.otAmount = otAmount;
    existingOT.otType = otType;
    existingOT.otRate = otRate;
    if (existingOT.status === 'PENDING') {
      existingOT.status = 'APPROVED';
    }
    await existingOT.save();
    return res.json({
      success: true,
      data: existingOT,
    });
  }

  const overtime = await Overtime.create({
    tenantId: req.tenantId,
    employeeId,
    date: new Date(date),
    requestType: 'AUTO_DETECTED',
    actualHours: otHours,
    otType,
    otRate,
    hourlyRate,
    otAmount,
    status: 'APPROVED',
    approvedBy: req.user._id,
    approvedDate: new Date(),
  });

  res.json({
    success: true,
    data: overtime,
  });
});

// @desc    Get OT requests/records
// @route   GET /api/overtime
// @access  Private
exports.getOvertime = asyncHandler(async (req, res) => {
  const { employeeId, status, startDate, endDate, page = 1, limit = 50 } = req.query;

  const query = { tenantId: req.tenantId };

  if (employeeId) {
    query.employeeId = employeeId;
  } else if (req.user.role === 'Employee') {
    query.employeeId = req.user.employeeId;
  }

  if (status) query.status = status;
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const overtime = await Overtime.find(query)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('approvedBy', 'name email')
    .sort({ date: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Overtime.countDocuments(query);

  res.json({
    success: true,
    data: overtime,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});
