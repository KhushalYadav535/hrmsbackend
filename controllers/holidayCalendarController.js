const HolidayCalendar = require('../models/HolidayCalendar');
const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get all holidays
 * BRD Requirement: Holiday calendar for sandwich leave detection
 */
exports.getHolidays = asyncHandler(async (req, res) => {
  const { year } = req.query;

  const query = {
    tenantId: req.tenantId,
  };

  if (year) {
    query.year = parseInt(year);
  }

  const holidays = await HolidayCalendar.find(query).sort({ year: -1 });

  res.status(200).json({
    success: true,
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
 * Create a holiday or holiday calendar
 */
exports.createHoliday = asyncHandler(async (req, res) => {
  const { year, holidays } = req.body;

  // Validate required fields
  if (!year) {
    return res.status(400).json({
      success: false,
      message: 'Year is required',
    });
  }

  if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one holiday is required',
    });
  }

  // Validate each holiday in the array
  for (const holiday of holidays) {
    if (!holiday.date || !holiday.name) {
      return res.status(400).json({
        success: false,
        message: 'Each holiday must have a date and name',
      });
    }
  }

  // Convert holiday dates to Date objects
  const processedHolidays = holidays.map(h => ({
    ...h,
    date: new Date(h.date),
  }));

  const holiday = await HolidayCalendar.create({
    tenantId: req.tenantId,
    year: parseInt(year),
    holidays: processedHolidays,
  });

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Create',
    module: 'LMS',
    entityType: 'HolidayCalendar',
    entityId: holiday._id,
    details: `Created holiday calendar for year ${year} with ${holidays.length} holidays`,
    changes: JSON.stringify({ created: req.body }),
  });

  res.status(201).json({
    success: true,
    data: holiday,
  });
});

/**
 * Update a holiday calendar
 */
exports.updateHoliday = asyncHandler(async (req, res) => {
  const { holidays } = req.body;

  const holiday = await HolidayCalendar.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!holiday) {
    return res.status(404).json({
      success: false,
      message: 'Holiday calendar not found',
    });
  }

  const oldData = { ...holiday.toObject() };

  // Process and update holidays if provided
  if (holidays && Array.isArray(holidays)) {
    const processedHolidays = holidays.map(h => ({
      ...h,
      date: typeof h.date === 'string' ? new Date(h.date) : h.date,
    }));
    holiday.holidays = processedHolidays;
  }

  // Update other fields if provided
  if (req.body.year) {
    holiday.year = parseInt(req.body.year);
  }

  await holiday.save();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Update',
    module: 'LMS',
    entityType: 'HolidayCalendar',
    entityId: holiday._id,
    details: `Updated holiday calendar for year ${holiday.year}`,
    changes: JSON.stringify({ old: oldData, new: holiday.toObject() }),
  });

  res.status(200).json({
    success: true,
    data: holiday,
  });
});

/**
 * Delete a holiday calendar
 */
exports.deleteHoliday = asyncHandler(async (req, res) => {
  const holiday = await HolidayCalendar.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!holiday) {
    return res.status(404).json({
      success: false,
      message: 'Holiday calendar not found',
    });
  }

  const deletedData = holiday.toObject();
  await holiday.deleteOne();

  // Audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Delete',
    module: 'LMS',
    entityType: 'HolidayCalendar',
    entityId: req.params.id,
    details: `Deleted holiday calendar for year ${holiday.year}`,
    changes: JSON.stringify({ deleted: deletedData }),
  });

  res.status(200).json({
    success: true,
    message: 'Holiday calendar deleted successfully',
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
    'holidays.date': { $gte: checkDate, $lt: nextDate },
  };

  // If location is specified, filter by applicable locations
  if (location) {
    query.$or = [
      { 'holidays.applicableLocations': { $size: 0 } },
      { 'holidays.applicableLocations': location },
    ];
  }

  const holidayCalendar = await HolidayCalendar.findOne(query);
  let isHoliday = false;
  let holidayData = null;

  if (holidayCalendar) {
    const foundHoliday = holidayCalendar.holidays.find(h => {
      const hDate = new Date(h.date);
      hDate.setHours(0, 0, 0, 0);
      const match = hDate.getTime() === checkDate.getTime();
      if (location && match) {
        return h.applicableLocations.length === 0 || h.applicableLocations.includes(location);
      }
      return match;
    });
    if (foundHoliday) {
      isHoliday = true;
      holidayData = foundHoliday;
    }
  }

  res.status(200).json({
    success: true,
    isHoliday,
    data: holidayData,
  });
});
