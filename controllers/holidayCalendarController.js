const HolidayCalendar = require('../models/HolidayCalendar');
const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get all holidays
 * BRD Requirement: Holiday calendar for sandwich leave detection
 */
exports.getHolidays = asyncHandler(async (req, res) => {
  const { year, month, holidayType, location } = req.query;

  const query = {
    tenantId: req.tenantId,
  };

  if (year) {
    const yearStart = new Date(parseInt(year), 0, 1);
    const yearEnd = new Date(parseInt(year), 11, 31, 23, 59, 59);
    query.holidayDate = { $gte: yearStart, $lte: yearEnd };
  }

  if (month !== undefined) {
    const monthStart = new Date(parseInt(year || new Date().getFullYear()), parseInt(month), 1);
    const monthEnd = new Date(parseInt(year || new Date().getFullYear()), parseInt(month) + 1, 0, 23, 59, 59);
    query.holidayDate = { $gte: monthStart, $lte: monthEnd };
  }

  if (holidayType) {
    query.holidayType = holidayType;
  }

  if (location) {
    query.$or = [
      { applicableLocations: { $size: 0 } }, // All locations
      { applicableLocations: location },
    ];
  }

  const holidays = await HolidayCalendar.find(query).sort({ holidayDate: 1 });

  res.status(200).json({
    success: true,
    count: holidays.length,
    data: holidays,
  });
});

/**
 * Get a single holiday
 */
exports.getHoliday = asyncHandler(async (req, res) => {
  const holiday = await HolidayCalendar.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!holiday) {
    return res.status(404).json({
      success: false,
      message: 'Holiday not found',
    });
  }

  res.status(200).json({
    success: true,
    data: holiday,
  });
});

/**
 * Create a holiday
 */
exports.createHoliday = asyncHandler(async (req, res) => {
  const { holidayDate, holidayName, holidayType, isRecurring, applicableLocations } = req.body;

  if (!holidayDate || !holidayName) {
    return res.status(400).json({
      success: false,
      message: 'Holiday date and name are required',
    });
  }

  const holiday = await HolidayCalendar.create({
    ...req.body,
    tenantId: req.tenantId,
    holidayDate: new Date(holidayDate),
  });

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'LMS',
    entityType: 'HolidayCalendar',
    entityId: holiday._id,
    description: `Created holiday: ${holidayName} on ${holidayDate}`,
    changes: { created: req.body },
  });

  res.status(201).json({
    success: true,
    data: holiday,
  });
});

/**
 * Update a holiday
 */
exports.updateHoliday = asyncHandler(async (req, res) => {
  const holiday = await HolidayCalendar.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!holiday) {
    return res.status(404).json({
      success: false,
      message: 'Holiday not found',
    });
  }

  const oldData = { ...holiday.toObject() };

  if (req.body.holidayDate) {
    req.body.holidayDate = new Date(req.body.holidayDate);
  }

  Object.assign(holiday, req.body);
  await holiday.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    module: 'LMS',
    entityType: 'HolidayCalendar',
    entityId: holiday._id,
    description: `Updated holiday: ${holiday.holidayName}`,
    changes: { old: oldData, new: req.body },
  });

  res.status(200).json({
    success: true,
    data: holiday,
  });
});

/**
 * Delete a holiday
 */
exports.deleteHoliday = asyncHandler(async (req, res) => {
  const holiday = await HolidayCalendar.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!holiday) {
    return res.status(404).json({
      success: false,
      message: 'Holiday not found',
    });
  }

  await holiday.deleteOne();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'DELETE',
    module: 'LMS',
    entityType: 'HolidayCalendar',
    entityId: req.params.id,
    description: `Deleted holiday: ${holiday.holidayName}`,
    changes: { deleted: holiday.toObject() },
  });

  res.status(200).json({
    success: true,
    message: 'Holiday deleted successfully',
  });
});

/**
 * Check if a date is a holiday
 */
exports.checkHoliday = asyncHandler(async (req, res) => {
  const { date, location } = req.query;

  if (!date) {
    return res.status(400).json({
      success: false,
      message: 'Date is required',
    });
  }

  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  const nextDate = new Date(checkDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const query = {
    tenantId: req.tenantId,
    holidayDate: { $gte: checkDate, $lt: nextDate },
  };

  if (location) {
    query.$or = [
      { applicableLocations: { $size: 0 } },
      { applicableLocations: location },
    ];
  }

  const holiday = await HolidayCalendar.findOne(query);

  res.status(200).json({
    success: true,
    isHoliday: !!holiday,
    data: holiday,
  });
});
