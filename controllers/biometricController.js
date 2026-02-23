const BiometricPunch = require('../models/BiometricPunch');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * Biometric Integration Controller
 * BRD: BR-P1-002 - Attendance Enhancements
 */

// @desc    Sync biometric punches
// @route   POST /api/biometric/sync
// @access  Private (System/HR Administrator)
exports.syncBiometricPunches = asyncHandler(async (req, res) => {
  const { punches } = req.body; // Array of punch data from biometric device

  if (!Array.isArray(punches) || punches.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid punches data',
    });
  }

  const synced = [];
  const errors = [];

  for (const punchData of punches) {
    try {
      const { biometricId, punchTime, deviceId, deviceLocation } = punchData;

      // Find employee by biometric ID
      const employee = await Employee.findOne({
        tenantId: req.tenantId,
        // Assuming biometricId is stored in employee model or mapping table
        // For now, using employeeCode as biometricId
        employeeCode: biometricId,
      });

      if (!employee) {
        errors.push({
          biometricId,
          error: 'Employee not found',
        });
        continue;
      }

      // Determine punch type (IN/OUT) - simple logic: first punch of day = IN
      const punchDate = new Date(punchTime);
      punchDate.setHours(0, 0, 0, 0);
      const endOfDay = new Date(punchDate);
      endOfDay.setHours(23, 59, 59, 999);

      const existingPunches = await BiometricPunch.find({
        tenantId: req.tenantId,
        employeeId: employee._id,
        punchTime: { $gte: punchDate, $lte: endOfDay },
      }).sort({ punchTime: 1 });

      let punchType = 'UNKNOWN';
      if (existingPunches.length === 0) {
        punchType = 'IN';
      } else {
        // If last punch was IN, this is OUT; otherwise IN
        const lastPunch = existingPunches[existingPunches.length - 1];
        punchType = lastPunch.punchType === 'IN' ? 'OUT' : 'IN';
      }

      const punch = await BiometricPunch.create({
        tenantId: req.tenantId,
        employeeId: employee._id,
        biometricId,
        punchTime: new Date(punchTime),
        deviceId,
        deviceLocation,
        punchType,
        syncStatus: 'SYNCED',
      });

      // Auto-process into attendance
      await processPunchToAttendance(employee._id, punchDate, req.tenantId);

      synced.push(punch);
    } catch (error) {
      errors.push({
        punchData,
        error: error.message,
      });
    }
  }

  res.json({
    success: true,
    data: {
      synced: synced.length,
      errors: errors.length,
      syncedPunches: synced,
      errors: errors,
    },
  });
});

// @desc    Process punches into attendance
// @route   POST /api/biometric/process
// @access  Private (System/HR Administrator)
exports.processPunches = asyncHandler(async (req, res) => {
  const { employeeId, date } = req.body;

  const punchDate = new Date(date);
  punchDate.setHours(0, 0, 0, 0);
  const endOfDay = new Date(punchDate);
  endOfDay.setHours(23, 59, 59, 999);

  const punches = await BiometricPunch.find({
    tenantId: req.tenantId,
    employeeId,
    punchTime: { $gte: punchDate, $lte: endOfDay },
    syncStatus: { $ne: 'PROCESSED' },
  }).sort({ punchTime: 1 });

  if (punches.length === 0) {
    return res.json({
      success: true,
      message: 'No punches found for processing',
    });
  }

  const result = await processPunchToAttendance(employeeId, punchDate, req.tenantId);

  // Mark punches as processed
  await BiometricPunch.updateMany(
    {
      tenantId: req.tenantId,
      employeeId,
      punchTime: { $gte: punchDate, $lte: endOfDay },
    },
    { syncStatus: 'PROCESSED', processedDate: new Date() }
  );

  res.json({
    success: true,
    data: result,
  });
});

/**
 * Helper function to process punches into attendance
 */
async function processPunchToAttendance(employeeId, date, tenantId) {
  const punchDate = new Date(date);
  punchDate.setHours(0, 0, 0, 0);
  const endOfDay = new Date(punchDate);
  endOfDay.setHours(23, 59, 59, 999);

  const punches = await BiometricPunch.find({
    tenantId,
    employeeId,
    punchTime: { $gte: punchDate, $lte: endOfDay },
  }).sort({ punchTime: 1 });

  if (punches.length === 0) {
    return null;
  }

  const firstPunch = punches[0];
  const lastPunch = punches[punches.length - 1];

  const checkIn = firstPunch.punchTime;
  const checkOut = lastPunch.punchType === 'OUT' ? lastPunch.punchTime : null;

  // Calculate working hours
  let workingHours = 0;
  if (checkIn && checkOut) {
    const diffTime = Math.abs(checkOut - checkIn);
    workingHours = Math.round((diffTime / (1000 * 60 * 60)) * 10) / 10;
  }

  // Determine status
  let status = 'Present';
  if (!checkOut) {
    status = 'Half Day';
  } else if (workingHours < 4) {
    status = 'Half Day';
  }

  // Get or create attendance record
  let attendance = await Attendance.findOne({
    tenantId,
    employeeId,
    date: punchDate,
  });

  if (attendance) {
    attendance.checkIn = checkIn;
    attendance.checkOut = checkOut;
    attendance.workingHours = workingHours;
    attendance.status = status;
    await attendance.save();
  } else {
    attendance = await Attendance.create({
      tenantId,
      employeeId,
      date: punchDate,
      checkIn,
      checkOut,
      workingHours,
      status,
    });
  }

  return attendance;
}

// @desc    Get biometric punches
// @route   GET /api/biometric/punches
// @access  Private
exports.getBiometricPunches = asyncHandler(async (req, res) => {
  const { employeeId, startDate, endDate, deviceId, page = 1, limit = 50 } = req.query;

  const query = { tenantId: req.tenantId };

  if (employeeId) query.employeeId = employeeId;
  if (deviceId) query.deviceId = deviceId;
  if (startDate || endDate) {
    query.punchTime = {};
    if (startDate) query.punchTime.$gte = new Date(startDate);
    if (endDate) query.punchTime.$lte = new Date(endDate);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const punches = await BiometricPunch.find(query)
    .populate('employeeId', 'firstName lastName employeeCode')
    .sort({ punchTime: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await BiometricPunch.countDocuments(query);

  res.json({
    success: true,
    data: punches,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});
