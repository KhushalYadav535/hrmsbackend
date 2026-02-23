const CompOff = require('../models/CompOff');
const Employee = require('../models/Employee');
const HolidayCalendar = require('../models/HolidayCalendar');
const WeeklyOff = require('../models/WeeklyOff');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * Compensatory Off Controller
 * BRD: BR-P1-003 - Leave Management Enhancements - Comp-Off
 */

// @desc    Request comp-off (for working on holiday/weekly off)
// @route   POST /api/comp-off/request
// @access  Private (Employee)
exports.requestCompOff = asyncHandler(async (req, res) => {
  const { workedDate, workedHours, reason } = req.body;

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

  // Verify it's a holiday or weekly off
  const workDate = new Date(workedDate);
  const year = workDate.getFullYear();
  
  // Check if it's a holiday
  const holidayCalendar = await HolidayCalendar.findOne({
    tenantId: req.tenantId,
    year,
  });
  
  let isHoliday = false;
  if (holidayCalendar) {
    isHoliday = holidayCalendar.holidays.some(h => {
      const hDate = new Date(h.date);
      return hDate.toDateString() === workDate.toDateString();
    });
  }

  // Check if it's weekly off
  const dayOfWeek = workDate.getDay(); // 0 = Sunday, 6 = Saturday
  const weeklyOff = await WeeklyOff.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
  });
  
  let isWeeklyOff = false;
  if (weeklyOff) {
    const offDays = weeklyOff.offDays || [];
    isWeeklyOff = offDays.includes(dayOfWeek);
  }

  if (!isHoliday && !isWeeklyOff) {
    return res.status(400).json({
      success: false,
      message: 'Comp-off can only be requested for working on holidays or weekly offs',
    });
  }

  // Calculate comp-off days (1 day for full day, 0.5 for half day)
  const compOffDays = workedHours >= 4 ? 1 : 0.5;
  
  // Set expiry date (30 days from worked date)
  const expiryDate = new Date(workDate);
  expiryDate.setDate(expiryDate.getDate() + 30);

  const compOff = await CompOff.create({
    tenantId: req.tenantId,
    employeeId: employee._id,
    workedDate: workDate,
    workedHours,
    reason,
    compOffDays,
    expiryDate,
    requestedBy: req.user._id,
    status: 'PENDING',
  });

  await compOff.populate('employeeId', 'firstName lastName employeeCode');

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Request Comp-Off',
    module: 'Leave Management',
    entityType: 'CompOff',
    entityId: compOff._id,
    details: `Requested ${compOffDays} comp-off for working on ${workedDate}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    data: compOff,
    message: `Comp-off request submitted. ${compOffDays} comp-off will be credited after approval.`,
  });
});

// @desc    Approve/reject comp-off request
// @route   PATCH /api/comp-off/:id/approve
// @access  Private (Manager, HR Administrator)
exports.approveCompOff = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, rejectionReason } = req.body;

  const compOff = await CompOff.findById(id);
  if (!compOff || compOff.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Comp-off request not found',
    });
  }

  if (action === 'APPROVE') {
    compOff.status = 'APPROVED';
    compOff.approvedBy = req.user._id;
    compOff.approvedDate = new Date();
    
    // TODO: Credit comp-off to leave balance
    // This would require a CompOffBalance model or adding compOffBalance to LeaveBalance
    
  } else if (action === 'REJECT') {
    compOff.status = 'REJECTED';
    compOff.rejectionReason = rejectionReason;
  }

  await compOff.save();

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: `${action} Comp-Off`,
    module: 'Leave Management',
    entityType: 'CompOff',
    entityId: compOff._id,
    details: `${action} comp-off request`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.json({
    success: true,
    data: compOff,
  });
});

// @desc    Get comp-off requests/balance
// @route   GET /api/comp-off
// @access  Private
exports.getCompOff = asyncHandler(async (req, res) => {
  const { employeeId, status } = req.query;

  const query = { tenantId: req.tenantId };

  if (employeeId) {
    query.employeeId = employeeId;
  } else if (req.user.role === 'Employee') {
    query.employeeId = req.user.employeeId;
  }

  if (status) query.status = status;

  const compOffs = await CompOff.find(query)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('approvedBy', 'name email')
    .sort({ workedDate: -1 })
    .lean();

  // Calculate balance (approved but not availed and not expired)
  const now = new Date();
  const balance = compOffs
    .filter(co => 
      co.status === 'APPROVED' && 
      (!co.expiryDate || new Date(co.expiryDate) > now) &&
      co.compOffDate === null
    )
    .reduce((sum, co) => sum + (co.compOffDays || 0), 0);

  res.json({
    success: true,
    data: compOffs,
    balance,
  });
});

// @desc    Avail comp-off (use it as leave)
// @route   POST /api/comp-off/:id/avail
// @access  Private (Employee)
exports.availCompOff = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { availDate } = req.body;

  const compOff = await CompOff.findById(id);
  if (!compOff || compOff.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Comp-off not found',
    });
  }

  if (compOff.employeeId.toString() !== req.user.employeeId?.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You can only avail your own comp-off',
    });
  }

  if (compOff.status !== 'APPROVED') {
    return res.status(400).json({
      success: false,
      message: 'Only approved comp-off can be availed',
    });
  }

  if (compOff.expiryDate && new Date(compOff.expiryDate) < new Date()) {
    return res.status(400).json({
      success: false,
      message: 'Comp-off has expired',
    });
  }

  if (compOff.compOffDate) {
    return res.status(400).json({
      success: false,
      message: 'Comp-off already availed',
    });
  }

  compOff.compOffDate = new Date(availDate);
  compOff.status = 'AVAILED';
  await compOff.save();

  // TODO: Create leave request entry for comp-off
  // This would integrate with LeaveRequest model

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Avail Comp-Off',
    module: 'Leave Management',
    entityType: 'CompOff',
    entityId: compOff._id,
    details: `Availed comp-off on ${availDate}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.json({
    success: true,
    data: compOff,
  });
});

// @desc    Auto-expire comp-offs (scheduled job)
// @route   POST /api/comp-off/expire
// @access  Private (System/HR Administrator)
exports.expireCompOffs = asyncHandler(async (req, res) => {
  const now = new Date();
  
  const expired = await CompOff.updateMany(
    {
      tenantId: req.tenantId,
      status: 'APPROVED',
      expiryDate: { $lt: now },
      compOffDate: null,
    },
    {
      status: 'EXPIRED',
    }
  );

  res.json({
    success: true,
    message: `Expired ${expired.modifiedCount} comp-offs`,
    expiredCount: expired.modifiedCount,
  });
});
