const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');

// @desc    Get all attendance records
// @route   GET /api/attendance
// @access  Private
exports.getAttendances = async (req, res) => {
  try {
    const { employeeId, startDate, endDate, status } = req.query;
    const filter = { tenantId: req.tenantId };

    // Security Check: If user is Employee, restrict to their own records ONLY
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ 
        email: req.user.email,
        tenantId: req.tenantId 
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee record not found for this user',
        });
      }

      filter.employeeId = employee._id;
    } else if (employeeId) {
      filter.employeeId = employeeId;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (status) filter.status = status;

    const attendances = await Attendance.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode department designation')
      .populate('approvedBy', 'name email')
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      count: attendances.length,
      data: attendances,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single attendance record
// @route   GET /api/attendance/:id
// @access  Private
exports.getAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    })
      .populate('employeeId', 'firstName lastName employeeCode department designation email')
      .populate('approvedBy', 'name email');

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    // Security Check: If user is Employee, ensure it belongs to them
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ 
        email: req.user.email,
        tenantId: req.tenantId 
      });
      
      if (!employee || attendance.employeeId._id.toString() !== employee._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this attendance record',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create attendance record
// @route   POST /api/attendance
// @access  Private (HR Admin, Tenant Admin, Manager)
exports.createAttendance = async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required',
      });
    }

    req.body.tenantId = req.tenantId;

    // Check if attendance already exists for this employee and date
    const existingAttendance = await Attendance.findOne({
      tenantId: req.tenantId,
      employeeId: req.body.employeeId,
      date: req.body.date,
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Attendance record already exists for this employee and date',
      });
    }

    const attendance = await Attendance.create(req.body);

    res.status(201).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    console.error('Error creating attendance:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Attendance record already exists for this employee and date',
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message).join(', ');
      return res.status(400).json({
        success: false,
        message: messages,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update attendance record
// @route   PUT /api/attendance/:id
// @access  Private (HR Admin, Tenant Admin, Manager)
exports.updateAttendance = async (req, res) => {
  try {
    let attendance = await Attendance.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    attendance = await Attendance.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete attendance record
// @route   DELETE /api/attendance/:id
// @access  Private (HR Admin, Tenant Admin)
exports.deleteAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    await attendance.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Attendance record deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Check In - Mark attendance for today
// @route   POST /api/attendance/checkin
// @access  Private
exports.checkIn = async (req, res) => {
  try {
    // Find employee by user email
    const employee = await Employee.findOne({ 
      email: req.user.email,
      tenantId: req.tenantId 
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found for this user',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if attendance already exists for today
    let attendance = await Attendance.findOne({
      tenantId: req.tenantId,
      employeeId: employee._id,
      date: today,
    });

    const checkInTime = new Date();

    if (attendance) {
      // Update existing attendance with check-in
      if (attendance.checkIn) {
        return res.status(400).json({
          success: false,
          message: 'You have already checked in today',
        });
      }
      attendance.checkIn = checkInTime;
      attendance.status = 'Present';
      await attendance.save();
    } else {
      // Create new attendance record
      attendance = await Attendance.create({
        tenantId: req.tenantId,
        employeeId: employee._id,
        date: today,
        checkIn: checkInTime,
        status: 'Present',
        location: req.body.location || '',
        remarks: req.body.remarks || '',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Checked in successfully',
      data: attendance,
    });
  } catch (error) {
    console.error('Error checking in:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Check Out - Mark checkout for today
// @route   POST /api/attendance/checkout
// @access  Private
exports.checkOut = async (req, res) => {
  try {
    // Find employee by user email
    const employee = await Employee.findOne({ 
      email: req.user.email,
      tenantId: req.tenantId 
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found for this user',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's attendance
    let attendance = await Attendance.findOne({
      tenantId: req.tenantId,
      employeeId: employee._id,
      date: today,
    });

    if (!attendance || !attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: 'Please check in first before checking out',
      });
    }

    if (attendance.checkOut) {
      return res.status(400).json({
        success: false,
        message: 'You have already checked out today',
      });
    }

    const checkOutTime = new Date();
    attendance.checkOut = checkOutTime;
    
    // Calculate working hours
    const diffTime = Math.abs(checkOutTime - attendance.checkIn);
    attendance.workingHours = Math.round((diffTime / (1000 * 60 * 60)) * 10) / 10;
    
    await attendance.save();

    res.status(200).json({
      success: true,
      message: 'Checked out successfully',
      data: attendance,
    });
  } catch (error) {
    console.error('Error checking out:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get today's attendance status
// @route   GET /api/attendance/today
// @access  Private
exports.getTodayAttendance = async (req, res) => {
  try {
    // Find employee by user email
    const employee = await Employee.findOne({ 
      email: req.user.email,
      tenantId: req.tenantId 
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found for this user',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      tenantId: req.tenantId,
      employeeId: employee._id,
      date: today,
    });

    if (!attendance) {
      return res.status(200).json({
        success: true,
        data: {
          checkedIn: false,
          checkedOut: false,
          checkIn: null,
          checkOut: null,
          workingHours: 0,
          status: null,
        },
      });
    }

    // Calculate working hours if checked in but not checked out
    let workingHours = attendance.workingHours || 0;
    if (attendance.checkIn && !attendance.checkOut) {
      const diffTime = Math.abs(new Date() - attendance.checkIn);
      workingHours = Math.round((diffTime / (1000 * 60 * 60)) * 10) / 10;
    }

    res.status(200).json({
      success: true,
      data: {
        checkedIn: !!attendance.checkIn,
        checkedOut: !!attendance.checkOut,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        workingHours: workingHours,
        status: attendance.status,
      },
    });
  } catch (error) {
    console.error('Error getting today attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get attendance summary for employee
// @route   GET /api/attendance/summary/:employeeId
// @access  Private
exports.getAttendanceSummary = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;

    const filter = {
      tenantId: req.tenantId,
      employeeId: employeeId,
    };

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const attendances = await Attendance.find(filter);

    const summary = {
      totalDays: attendances.length,
      presentDays: attendances.filter(a => a.status === 'Present').length,
      absentDays: attendances.filter(a => a.status === 'Absent').length,
      leaveDays: attendances.filter(a => a.status === 'Leave').length,
      halfDays: attendances.filter(a => a.status === 'Half Day').length,
      totalWorkingHours: attendances.reduce((sum, a) => sum + (a.workingHours || 0), 0),
      averageWorkingHours: attendances.length > 0 
        ? (attendances.reduce((sum, a) => sum + (a.workingHours || 0), 0) / attendances.length).toFixed(1)
        : 0,
    };

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
