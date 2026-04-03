const mongoose = require('mongoose');
const WeeklyOff = require('../models/WeeklyOff');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/** Magic department value: one config applies to all employees in the tenant */
const TENANT_WIDE_DEPARTMENT = '__ENTIRE_TENANT__';

/** Nth occurrence of weekday in calendar month (1-based), e.g. 2nd Saturday */
function weekdayOccurrenceInMonth(date) {
  const dow = date.getDay();
  const y = date.getFullYear();
  const m = date.getMonth();
  const dayNum = date.getDate();
  let n = 0;
  for (let d = 1; d <= dayNum; d += 1) {
    const t = new Date(y, m, d);
    if (t.getDay() === dow) n += 1;
  }
  return n;
}

/**
 * Parse & validate weekly-off body. Returns { error } or { value } with normalized fields.
 */
function normalizeWeeklyOffBody(body) {
  const {
    employeeId,
    department,
    location,
    offType,
    fixedDays,
    alternateDays,
    rotatingPattern,
    compOffEnabled,
    compOffValidityDays,
    effectiveDate,
    endDate,
  } = body;

  const empIdStr =
    employeeId != null && String(employeeId).trim() !== '' ? String(employeeId).trim() : '';
  const deptStrRaw =
    department != null && String(department).trim() !== '' ? String(department).trim() : '';
  const locStr = location != null && String(location).trim() !== '' ? String(location).trim() : '';
  const isTenantWide = deptStrRaw === TENANT_WIDE_DEPARTMENT;

  const hasEmp = Boolean(empIdStr);
  const hasDept = Boolean(deptStrRaw);
  const hasLoc = Boolean(locStr);
  if (hasEmp + hasDept + hasLoc !== 1) {
    return {
      error: {
        status: 400,
        message: 'Must specify exactly one of: employeeId, department, or location',
      },
    };
  }

  const fixedNums = Array.isArray(fixedDays)
    ? [
        ...new Set(
          fixedDays
            .map((d) => parseInt(d, 10))
            .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6),
        ),
      ]
    : [];

  let alternateNorm = [];
  if (Array.isArray(alternateDays)) {
    alternateNorm = alternateDays
      .map((a) => ({
        dayOfWeek: parseInt(a.dayOfWeek, 10),
        weekNumbers: Array.isArray(a.weekNumbers)
          ? [
              ...new Set(
                a.weekNumbers
                  .map((w) => parseInt(w, 10))
                  .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 5),
              ),
            ]
          : [],
      }))
      .filter(
        (a) =>
          !Number.isNaN(a.dayOfWeek) &&
          a.dayOfWeek >= 0 &&
          a.dayOfWeek <= 6 &&
          a.weekNumbers.length > 0,
      );
  }

  if (offType === 'FIXED') {
    if (fixedNums.length === 0 && alternateNorm.length === 0) {
      return {
        error: {
          status: 400,
          message:
            'For fixed schedule, select at least one weekly off day or an alternate pattern (e.g. 2nd & 4th Saturday).',
        },
      };
    }
  }

  if (offType === 'ROTATING' && !rotatingPattern) {
    return {
      error: {
        status: 400,
        message: 'Rotating pattern required for ROTATING off type',
      },
    };
  }

  let deptOut = null;
  let locOut = null;
  if (hasEmp) {
    deptOut = null;
    locOut = null;
  } else if (isTenantWide) {
    deptOut = TENANT_WIDE_DEPARTMENT;
    locOut = null;
  } else if (locStr) {
    deptOut = null;
    locOut = locStr;
  } else if (deptStrRaw) {
    deptOut = deptStrRaw;
    locOut = null;
  }

  return {
    value: {
      hasEmp,
      empIdStr,
      deptStrRaw,
      locStr,
      isTenantWide,
      deptOut,
      locOut,
      fixedNums,
      alternateNorm,
      offType,
      rotatingPattern: rotatingPattern || null,
      compOffEnabled: compOffEnabled !== false,
      compOffValidityDays: compOffValidityDays || 30,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
    },
  };
}

function buildDeactivateQuery(tenantId, v) {
  const deactivateQuery = { tenantId, isActive: true };
  if (v.hasEmp) {
    deactivateQuery.employeeId = v.empIdStr;
  } else if (v.isTenantWide) {
    deactivateQuery.department = TENANT_WIDE_DEPARTMENT;
    deactivateQuery.employeeId = null;
  } else if (v.locStr) {
    deactivateQuery.location = v.locStr;
    deactivateQuery.employeeId = null;
    deactivateQuery.department = null;
  } else if (v.deptStrRaw) {
    deactivateQuery.department = v.deptStrRaw;
    deactivateQuery.employeeId = null;
  }
  return deactivateQuery;
}

async function auditWeeklyOff(req, action, entityId, details) {
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || req.user.email || 'Unknown',
    userEmail: req.user.email,
    action,
    module: 'Attendance',
    entityType: 'WeeklyOff',
    entityId,
    details,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });
}

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

// @desc    Create weekly off configuration
// @route   POST /api/weekly-off
// @access  Private (HR Administrator, Tenant Admin)
exports.createWeeklyOff = asyncHandler(async (req, res) => {
  const parsed = normalizeWeeklyOffBody(req.body);
  if (parsed.error) {
    return res.status(parsed.error.status).json({
      success: false,
      message: parsed.error.message,
    });
  }
  const v = parsed.value;

  const deactivateQuery = buildDeactivateQuery(req.tenantId, v);
  await WeeklyOff.updateMany(deactivateQuery, {
    isActive: false,
    endDate: v.effectiveDate,
  });

  const weeklyOff = await WeeklyOff.create({
    tenantId: req.tenantId,
    employeeId: v.hasEmp ? v.empIdStr : null,
    department: v.deptOut,
    location: v.locOut,
    offType: v.offType,
    fixedDays: v.fixedNums,
    alternateDays: v.alternateNorm,
    rotatingPattern: v.rotatingPattern,
    compOffEnabled: v.compOffEnabled,
    compOffValidityDays: v.compOffValidityDays,
    effectiveDate: v.effectiveDate,
    endDate: v.endDate,
  });

  await auditWeeklyOff(
    req,
    'Create',
    weeklyOff._id,
    `Weekly off configuration created: ${v.offType}`,
  );

  res.status(201).json({
    success: true,
    data: weeklyOff,
  });
});

// @desc    Update weekly off configuration
// @route   PUT /api/weekly-off/:id
// @access  Private (HR Administrator, Tenant Admin)
exports.updateWeeklyOff = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid weekly off id' });
  }

  const doc = await WeeklyOff.findOne({
    _id: id,
    tenantId: req.tenantId,
    isActive: true,
  });
  if (!doc) {
    return res.status(404).json({
      success: false,
      message: 'Weekly off configuration not found',
    });
  }

  const parsed = normalizeWeeklyOffBody(req.body);
  if (parsed.error) {
    return res.status(parsed.error.status).json({
      success: false,
      message: parsed.error.message,
    });
  }
  const v = parsed.value;

  const deactivateQuery = buildDeactivateQuery(req.tenantId, v);
  deactivateQuery._id = { $ne: doc._id };

  await WeeklyOff.updateMany(deactivateQuery, {
    isActive: false,
    endDate: v.effectiveDate,
  });

  doc.set({
    employeeId: v.hasEmp ? v.empIdStr : null,
    department: v.deptOut,
    location: v.locOut,
    offType: v.offType,
    fixedDays: v.fixedNums,
    alternateDays: v.alternateNorm,
    rotatingPattern: v.rotatingPattern,
    compOffEnabled: v.compOffEnabled,
    compOffValidityDays: v.compOffValidityDays,
    effectiveDate: v.effectiveDate,
    endDate: v.endDate,
    isActive: true,
  });
  await doc.save();

  await auditWeeklyOff(
    req,
    'Update',
    doc._id,
    `Weekly off configuration updated: ${v.offType}`,
  );

  res.json({
    success: true,
    data: doc,
  });
});

// @desc    Deactivate weekly off configuration
// @route   DELETE /api/weekly-off/:id
// @access  Private (HR Administrator, Tenant Admin)
exports.deleteWeeklyOff = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid weekly off id' });
  }

  const doc = await WeeklyOff.findOne({
    _id: id,
    tenantId: req.tenantId,
    isActive: true,
  });
  if (!doc) {
    return res.status(404).json({
      success: false,
      message: 'Weekly off configuration not found',
    });
  }

  doc.isActive = false;
  doc.endDate = new Date();
  await doc.save();

  await auditWeeklyOff(
    req,
    'Delete',
    doc._id,
    `Weekly off configuration deactivated: ${doc.offType}`,
  );

  res.json({
    success: true,
    message: 'Weekly off configuration removed',
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
    weeklyOff = await WeeklyOff.findOne({
      tenantId: req.tenantId,
      department: TENANT_WIDE_DEPARTMENT,
      employeeId: null,
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
      
      let isOff = false;
      const fixedNorm = (weeklyOff.fixedDays || [])
        .map((d) => parseInt(d, 10))
        .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
      if (fixedNorm.includes(dayOfWeek)) {
        isOff = true;
      }
      
      // Calculate alternate days (e.g., 2nd and 4th Saturday)
      if (!isOff && weeklyOff.alternateDays && weeklyOff.alternateDays.length > 0) {
        const weekNum = weekdayOccurrenceInMonth(currentDate);
        const matchingAlternate = weeklyOff.alternateDays.find((a) => a.dayOfWeek === dayOfWeek);
        if (
          matchingAlternate &&
          matchingAlternate.weekNumbers &&
          matchingAlternate.weekNumbers.includes(weekNum)
        ) {
          isOff = true;
        }
      }

      if (isOff) {
        offDays.push(new Date(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else if (weeklyOff.offType === 'ROTATING') {
    const pattern = weeklyOff.rotatingPattern || {};
    const daysPerWeek = pattern.daysPerWeek || 2;
    const rotationCycle = pattern.rotationCycle || 7;
    const cycleStart = pattern.startDate ? new Date(pattern.startDate) : new Date(start);

    let currentDate = new Date(start);
    let cycleDay =
      Math.floor((currentDate.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) %
      rotationCycle;
    if (cycleDay < 0) cycleDay += rotationCycle;

    while (currentDate <= end) {
      const isOffDay = cycleDay < daysPerWeek;
      if (isOffDay) {
        offDays.push(new Date(currentDate));
      }

      currentDate.setDate(currentDate.getDate() + 1);
      cycleDay = (cycleDay + 1) % rotationCycle;
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
