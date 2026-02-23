const WeeklyOff = require('../models/WeeklyOff');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * Weekly Off Management Controller
 * BRD: BR-P1-002 - Attendance Enhancements
 */

// @desc    Get weekly off configuration
// @route   GET /api/weekly-off
// @access  Private
exports.getWeeklyOff = asyncHandler(async (req, res) => {
  const { employeeId, department, location } = req.query;

  const query = { tenantId: req.tenantId, isActive: true };

  if (employeeId) {
    query.employeeId = employeeId;
  } else if (department) {
    query.department = department;
    query.employeeId = null;
  } else if (location) {
    query.location = location;
    query.employeeId = null;
    query.department = null;
  }

  const weeklyOff = await WeeklyOff.find(query)
    .populate('employeeId', 'firstName lastName employeeCode')
    .sort({ effectiveDate: -1 })
    .lean();

  res.json({
    success: true,
    data: weeklyOff,
  });
});

// @desc    Create/update weekly off configuration
// @route   POST /api/weekly-off
// @access  Private (HR Administrator, Tenant Admin)
exports.createWeeklyOff = asyncHandler(async (req, res) => {
  const {
    employeeId,
    department,
    location,
    offType,
    fixedDays,
    rotatingPattern,
    compOffEnabled,
    compOffValidityDays,
    effectiveDate,
    endDate,
  } = req.body;

  // Validate: Only one of employeeId, department, or location should be set
  const count = [employeeId, department, location].filter(Boolean).length;
  if (count !== 1) {
    return res.status(400).json({
      success: false,
      message: 'Must specify exactly one of: employeeId, department, or location',
    });
  }

  if (offType === 'FIXED' && (!fixedDays || fixedDays.length === 0)) {
    return res.status(400).json({
      success: false,
      message: 'Fixed days required for FIXED off type',
    });
  }

  if (offType === 'ROTATING' && !rotatingPattern) {
    return res.status(400).json({
      success: false,
      message: 'Rotating pattern required for ROTATING off type',
    });
  }

  // Deactivate previous configuration
  const deactivateQuery = { tenantId: req.tenantId, isActive: true };
  if (employeeId) deactivateQuery.employeeId = employeeId;
  if (department) deactivateQuery.department = department;
  if (location) deactivateQuery.location = location;

  await WeeklyOff.updateMany(deactivateQuery, {
    isActive: false,
    endDate: effectiveDate ? new Date(effectiveDate) : new Date(),
  });

  const weeklyOff = await WeeklyOff.create({
    tenantId: req.tenantId,
    employeeId: employeeId || null,
    department: department || null,
    location: location || null,
    offType,
    fixedDays: fixedDays || [],
    rotatingPattern: rotatingPattern || null,
    compOffEnabled: compOffEnabled !== false,
    compOffValidityDays: compOffValidityDays || 30,
    effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
    endDate: endDate ? new Date(endDate) : null,
  });

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Create Weekly Off Configuration',
    module: 'Attendance',
    entityType: 'WeeklyOff',
    entityId: weeklyOff._id,
    details: `Created weekly off config: ${offType}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    data: weeklyOff,
  });
});

// @desc    Get employee's weekly off days for a date range
// @route   GET /api/weekly-off/employee/:employeeId/calendar
// @access  Private
exports.getEmployeeWeeklyOffCalendar = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const { startDate, endDate } = req.query;

  const employee = await Employee.findById(employeeId);
  if (!employee || employee.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  // Find weekly off configuration (employee-specific, department, or location)
  let weeklyOff = await WeeklyOff.findOne({
    tenantId: req.tenantId,
    employeeId,
    isActive: true,
  });

  if (!weeklyOff) {
    weeklyOff = await WeeklyOff.findOne({
      tenantId: req.tenantId,
      department: employee.department,
      employeeId: null,
      isActive: true,
    });
  }

  if (!weeklyOff) {
    weeklyOff = await WeeklyOff.findOne({
      tenantId: req.tenantId,
      location: employee.location,
      employeeId: null,
      department: null,
      isActive: true,
    });
  }

  if (!weeklyOff) {
    return res.json({
      success: true,
      data: [],
      message: 'No weekly off configuration found',
    });
  }

  // Generate weekly off days for date range
  const start = new Date(startDate || new Date());
  const end = new Date(endDate || new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000));
  const offDays = [];

  if (weeklyOff.offType === 'FIXED') {
    // Fixed days - generate for each week
    let currentDate = new Date(start);
    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();
      if (weeklyOff.fixedDays.includes(dayOfWeek)) {
        offDays.push(new Date(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else if (weeklyOff.offType === 'ROTATING') {
    // Rotating pattern
    const pattern = weeklyOff.rotatingPattern;
    const daysPerWeek = pattern.daysPerWeek || 2;
    const cycleStart = pattern.startDate ? new Date(pattern.startDate) : new Date(start);
    
    let currentDate = new Date(start);
    let cycleDay = Math.floor((currentDate - cycleStart) / (1000 * 60 * 60 * 24)) % pattern.rotationCycle;
    
    while (currentDate <= end) {
      // Calculate if this day is an off day based on rotation
      const isOffDay = cycleDay < daysPerWeek;
      if (isOffDay) {
        offDays.push(new Date(currentDate));
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      cycleDay = (cycleDay + 1) % pattern.rotationCycle;
    }
  }

  res.json({
    success: true,
    data: {
      configuration: weeklyOff,
      offDays,
    },
  });
});
