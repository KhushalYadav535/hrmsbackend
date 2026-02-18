const LeaveRequest = require('../models/LeaveRequest');
const LeavePolicy = require('../models/LeavePolicy');
const Employee = require('../models/Employee');
const HolidayCalendar = require('../models/HolidayCalendar');
const AuditLog = require('../models/AuditLog');
const { updateLeaveBalance } = require('./leaveAccrualController');
const { sendNotification } = require('../utils/notificationService');
const mongoose = require('mongoose');

// @desc    Get all leave requests
// @route   GET /api/leaves
// @access  Private
exports.getLeaves = async (req, res) => {
  try {
    const { employeeId, status, leaveType } = req.query;
    const filter = { tenantId: req.tenantId };

    // Security: If user is Employee, restrict to their own records ONLY
    if (req.user.role === 'Employee') {
      // Find the employee record associated with this user
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

      // Force filter to current employee's ID
      filter.employeeId = employee._id;
    } else if (employeeId) {
      // For Admins/Managers, allow filtering by specific employee if provided
      filter.employeeId = employeeId;
    }

    if (status) filter.status = status;
    if (leaveType) filter.leaveType = leaveType;

    // HR Administrator and Tenant Admin can see ALL employee leaves in their tenant
    // Manager can see team member leaves
    if (req.user.role === 'Manager' && !employeeId) {
      const teamMembers = await Employee.find({
        tenantId: req.tenantId,
        reportingManager: req.user._id,
      }).select('_id');
      filter.employeeId = { $in: teamMembers.map((e) => e._id) };
    }
    // HR Administrator and Tenant Admin: No employeeId filter means show all leaves in tenant
    // This is already handled by the tenantId filter above

    console.log('getLeaves - Filter:', JSON.stringify(filter, null, 2));
    console.log('getLeaves - User role:', req.user.role);
    console.log('getLeaves - Tenant ID:', req.tenantId);

    const leaves = await LeaveRequest.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode email')
      .populate('approverId', 'name email role')
      .sort({ appliedDate: -1 });

    console.log('getLeaves - Found leaves:', leaves.length);
    if (status === 'Pending') {
      console.log('getLeaves - Pending leaves count:', leaves.length);
    }

    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single leave request
// @route   GET /api/leaves/:id
// @access  Private
exports.getLeave = async (req, res) => {
  try {
    const leave = await LeaveRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    })
      .populate('employeeId', 'firstName lastName employeeCode email')
      .populate('approverId', 'name email role');

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    res.status(200).json({
      success: true,
      data: leave,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get leave balance for employee
// @route   GET /api/leaves/balance/:employeeId
// @access  Private
exports.getLeaveBalance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const tenantId = req.tenantId;

    // Verify employee belongs to tenant
    const employee = await Employee.findOne({
      _id: employeeId,
      tenantId: tenantId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Get all active leave policies for tenant ONLY
    const leavePolicies = await LeavePolicy.find({
      tenantId: tenantId,
      status: 'Active',
    });

    // Log for debugging - ensure only tenant's policies are returned
    console.log(`[getLeaveBalance] Tenant ID: ${tenantId}, Found ${leavePolicies.length} active leave policies for this tenant`);
    if (leavePolicies.length > 0) {
      console.log(`[getLeaveBalance] Policies:`, leavePolicies.map(p => p.leaveType).join(', '));
    }

    // Calculate financial year
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const financialYear = currentDate.getMonth() >= 3 ? currentYear : currentYear - 1; // FY starts April

    // Get leave balances from LeaveBalance model (if accrual has been run)
    const LeaveBalance = require('../models/LeaveBalance');
    const existingBalances = await LeaveBalance.find({
      tenantId: tenantId,
      employeeId: employeeId,
      financialYear: financialYear,
    });

    // Calculate balance for each leave type based on accrual settings
    const balances = await Promise.all(
      leavePolicies.map(async (policy) => {
        // Find existing balance record
        let leaveBalance = existingBalances.find(b => b.leaveType === policy.leaveType);

        // Initialize variables (will be used regardless of whether balance exists)
        let accruedDays = 0;
        let availableDays = 0;
        const accrualFrequency = policy.accrualFrequency || 'Monthly';
        const accrualRate = policy.accrualRate || (policy.daysPerYear / 12);
        const accrualDate = policy.accrualDate || 1; // Day of month when accrual happens

        if (!leaveBalance) {
          // Calculate accrued balance based on accrual frequency and employee joining date
          const joinDate = new Date(employee.joinDate);
          const currentDate = new Date();
          
          // Calculate financial year start (April 1st)
          const fyStart = new Date(financialYear, 3, 1); // April 1st
          const effectiveStartDate = joinDate > fyStart ? joinDate : fyStart;

          if (accrualFrequency === 'Monthly') {
            // Count number of accrual periods (months) where accrual date has passed
            let accrualPeriods = 0;
            
            // Start from effective start date (FY start or join date, whichever is later)
            let checkDate = new Date(effectiveStartDate);
            
            // Find the first accrual date after effective start
            // If join date is after accrual date in that month, start from next month
            if (checkDate.getDate() > accrualDate) {
              checkDate.setMonth(checkDate.getMonth() + 1);
            }
            checkDate.setDate(accrualDate);
            checkDate.setHours(0, 0, 0, 0);
            
            // Count accrual periods until current date
            const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
            while (checkDate <= currentDateOnly) {
              accrualPeriods++;
              // Move to next month's accrual date
              checkDate.setMonth(checkDate.getMonth() + 1);
              checkDate.setDate(accrualDate);
            }
            
            // Calculate accrued days
            accruedDays = accrualRate * accrualPeriods;
            
            // Pro-rata for first accrual if employee joined after accrual date in that month
            const firstAccrualDate = new Date(effectiveStartDate.getFullYear(), effectiveStartDate.getMonth(), accrualDate);
            if (effectiveStartDate > firstAccrualDate && accrualPeriods > 0) {
              // Employee joined after accrual date, so first accrual should be pro-rata
              const daysInMonth = new Date(effectiveStartDate.getFullYear(), effectiveStartDate.getMonth() + 1, 0).getDate();
              const daysWorked = daysInMonth - effectiveStartDate.getDate() + 1;
              const proRataDays = accrualRate * (daysWorked / daysInMonth);
              // Replace first accrual with pro-rata
              accruedDays = accruedDays - accrualRate + proRataDays;
            }
            
            console.log(`[getLeaveBalance] Monthly accrual for ${policy.leaveType}: ${accrualPeriods} periods × ${accrualRate} = ${accruedDays} days (Employee joined: ${employee.joinDate.toISOString().split('T')[0]}, Effective start: ${effectiveStartDate.toISOString().split('T')[0]})`);
          } else if (accrualFrequency === 'Quarterly') {
            // Calculate quarters since FY start
            const monthsSinceFYStart = (currentDate.getFullYear() - fyStart.getFullYear()) * 12 + 
                                      (currentDate.getMonth() - fyStart.getMonth());
            const quartersSinceFYStart = Math.floor(Math.max(0, monthsSinceFYStart) / 3);
            
            // Check if current quarter's accrual has happened
            const quarterStartMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
            const currentQuarterStart = new Date(currentDate.getFullYear(), Math.floor(currentDate.getMonth() / 3) * 3, accrualDate);
            if (currentDate >= currentQuarterStart && fyStart <= currentQuarterStart) {
              accruedDays = accrualRate * (quartersSinceFYStart + 1);
            } else {
              accruedDays = accrualRate * quartersSinceFYStart;
            }
          } else if (accrualFrequency === 'Yearly') {
            // Only if FY has started and accrual date has passed
            const fyAccrualDate = new Date(financialYear, 3, accrualDate); // April 1st (or accrualDate)
            if (currentDate >= fyAccrualDate) {
              accruedDays = accrualRate;
            }
          } else if (accrualFrequency === 'None') {
            // No accrual - show full entitlement at once
            accruedDays = policy.daysPerYear;
          }

          // Round to 1 decimal place
          accruedDays = Math.round(accruedDays * 10) / 10;
          
          // Ensure accrued days don't exceed daysPerYear
          accruedDays = Math.min(accruedDays, policy.daysPerYear);
          
          console.log(`[getLeaveBalance] Calculated accrued balance for ${policy.leaveType}: ${accruedDays} days (Frequency: ${accrualFrequency}, Rate: ${accrualRate}/period, DaysPerYear: ${policy.daysPerYear}, Employee joined: ${employee.joinDate.toISOString().split('T')[0]})`);
        } else {
          // Use existing balance record (from accrual process)
          accruedDays = leaveBalance.accrued || 0;
          console.log(`[getLeaveBalance] Using existing balance record for ${policy.leaveType}: ${accruedDays} days (from LeaveBalance model)`);
        }

        // Count approved leaves of this type for this employee in current financial year
        const fyStart = new Date(financialYear, 3, 1); // April 1st
        const fyEnd = new Date(financialYear + 1, 2, 31); // March 31st
        
        const approvedLeaves = await LeaveRequest.aggregate([
          {
            $match: {
              tenantId: new mongoose.Types.ObjectId(tenantId),
              employeeId: new mongoose.Types.ObjectId(employeeId),
              leaveType: policy.leaveType,
              status: 'Approved',
              startDate: { $gte: fyStart, $lte: fyEnd },
            },
          },
          {
            $group: {
              _id: null,
              totalDays: { $sum: '$days' },
            },
          },
        ]);

        const usedDays = approvedLeaves.length > 0 ? approvedLeaves[0].totalDays : 0;
        const openingBalance = leaveBalance ? (leaveBalance.openingBalance || 0) : 0;
        const totalAccrued = openingBalance + accruedDays;
        availableDays = Math.max(0, totalAccrued - usedDays);

        // Apply max balance limit if configured
        if (policy.maxCarryForward && policy.maxCarryForward > 0) {
          availableDays = Math.min(availableDays, policy.maxCarryForward);
        }

        return {
          leaveType: policy.leaveType,
          daysPerYear: policy.daysPerYear,
          accrued: accruedDays,
          used: usedDays,
          available: Math.round(availableDays * 10) / 10, // Round to 1 decimal
          carryForward: policy.carryForward,
          maxCarryForward: policy.maxCarryForward || 0,
          accrualFrequency: policy.accrualFrequency,
          accrualRate: policy.accrualRate,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: balances,
    });
  } catch (error) {
    console.error('Get leave balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create leave request
// @route   POST /api/leaves
// @access  Private
exports.createLeave = async (req, res) => {
  try {
    // Validate required fields
    const { leaveType, startDate, endDate, reason } = req.body;
    
    if (!leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: leaveType, startDate, endDate, and reason are required',
      });
    }

    // Normalize leave type (trim whitespace) - needed early for validation
    const normalizedLeaveType = leaveType.trim();

    // Find employee by user email
    const employee = await Employee.findOne({ 
      email: req.user.email,
      tenantId: req.tenantId
    });
    
    if (!employee) {
       return res.status(404).json({
         success: false,
         message: 'Employee record not found for this user. Cannot apply for leave.',
       });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    // Check if start date is before end date
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be after end date',
      });
    }

    // Calculate days (inclusive of both start and end dates)
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // BRD Requirement: Medical certificate validation for sick leave > 3 days
    if (normalizedLeaveType.toLowerCase().includes('sick') && diffDays > 3) {
      if (!req.body.medicalCertificate || !req.body.medicalCertificate.url) {
        return res.status(400).json({
          success: false,
          message: 'Medical certificate is required for sick leave exceeding 3 days',
        });
      }
    }

    // BRD Requirement: Sandwich leave detection
    let isSandwichLeave = false;
    let sandwichDetails = null;
    
    // Check for holidays before and after leave period
    const dayBeforeStart = new Date(start);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
    
    const dayAfterEnd = new Date(end);
    dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
    
    // Check if day before start is weekend or holiday
    const dayBeforeDay = dayBeforeStart.getDay(); // 0 = Sunday, 6 = Saturday
    const isDayBeforeWeekend = dayBeforeDay === 0 || dayBeforeDay === 6;
    
    // Check if day after end is weekend or holiday
    const dayAfterDay = dayAfterEnd.getDay();
    const isDayAfterWeekend = dayAfterDay === 0 || dayAfterDay === 6;
    
    // Check for holidays
    const holidaysBefore = await HolidayCalendar.find({
      tenantId: req.tenantId,
      holidayDate: {
        $gte: new Date(dayBeforeStart.setHours(0, 0, 0, 0)),
        $lt: new Date(dayBeforeStart.setHours(23, 59, 59, 999)),
      },
    });
    
    const holidaysAfter = await HolidayCalendar.find({
      tenantId: req.tenantId,
      holidayDate: {
        $gte: new Date(dayAfterEnd.setHours(0, 0, 0, 0)),
        $lt: new Date(dayAfterEnd.setHours(23, 59, 59, 999)),
      },
    });
    
    if ((isDayBeforeWeekend || holidaysBefore.length > 0) && (isDayAfterWeekend || holidaysAfter.length > 0)) {
      isSandwichLeave = true;
      sandwichDetails = {
        previousHoliday: holidaysBefore.length > 0 ? holidaysBefore[0].holidayDate : dayBeforeStart,
        nextHoliday: holidaysAfter.length > 0 ? holidaysAfter[0].holidayDate : dayAfterEnd,
        detectedDate: new Date(),
      };
    }

    // Check if leave type exists in leave policies
    let leavePolicy = await LeavePolicy.findOne({
      tenantId: req.tenantId,
      leaveType: normalizedLeaveType,
      status: 'Active'
    });

    if (!leavePolicy) {
      // Try case-insensitive search as fallback
      const caseInsensitivePolicy = await LeavePolicy.findOne({
        tenantId: req.tenantId,
        $expr: { $eq: [{ $toLower: '$leaveType' }, normalizedLeaveType.toLowerCase()] },
        status: 'Active'
      });

      if (!caseInsensitivePolicy) {
        return res.status(400).json({
          success: false,
          message: `Leave type '${normalizedLeaveType}' is not available or inactive. Please select a valid leave type.`,
        });
      }
      
      // Use the found policy (with correct casing)
      leavePolicy = caseInsensitivePolicy;
    }

    // Check leave balance - calculate based on accrual settings
    // Skip balance check for Leave Without Pay (LWP) as it has unlimited balance
    if (!normalizedLeaveType.toLowerCase().includes('without pay') && 
        !normalizedLeaveType.toLowerCase().includes('lwp')) {
      
      // Calculate financial year
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const financialYear = currentDate.getMonth() >= 3 ? currentYear : currentYear - 1; // FY starts April
      
      // Get leave balance from LeaveBalance model (if accrual has been run)
      const LeaveBalance = require('../models/LeaveBalance');
      const leaveBalance = await LeaveBalance.findOne({
        tenantId: req.tenantId,
        employeeId: employee._id,
        leaveType: leavePolicy.leaveType,
        financialYear: financialYear,
      });

      let accruedDays = 0;
      let availableDays = 0;

      if (!leaveBalance) {
        // Calculate accrued balance based on accrual settings (same logic as getLeaveBalance)
        const joinDate = new Date(employee.joinDate);
        const fyStart = new Date(financialYear, 3, 1); // April 1st
        const effectiveStartDate = joinDate > fyStart ? joinDate : fyStart;
        
        const accrualFrequency = leavePolicy.accrualFrequency || 'Monthly';
        const accrualRate = leavePolicy.accrualRate || (leavePolicy.daysPerYear / 12);
        const accrualDate = leavePolicy.accrualDate || 1;

        if (accrualFrequency === 'Monthly') {
          let accrualPeriods = 0;
          let checkDate = new Date(effectiveStartDate);
          
          if (checkDate.getDate() > accrualDate) {
            checkDate.setMonth(checkDate.getMonth() + 1);
          }
          checkDate.setDate(accrualDate);
          checkDate.setHours(0, 0, 0, 0);
          
          const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
          while (checkDate <= currentDateOnly) {
            accrualPeriods++;
            checkDate.setMonth(checkDate.getMonth() + 1);
            checkDate.setDate(accrualDate);
          }
          
          accruedDays = accrualRate * accrualPeriods;
          
          const firstAccrualDate = new Date(effectiveStartDate.getFullYear(), effectiveStartDate.getMonth(), accrualDate);
          if (effectiveStartDate > firstAccrualDate && accrualPeriods > 0) {
            const daysInMonth = new Date(effectiveStartDate.getFullYear(), effectiveStartDate.getMonth() + 1, 0).getDate();
            const daysWorked = daysInMonth - effectiveStartDate.getDate() + 1;
            const proRataDays = accrualRate * (daysWorked / daysInMonth);
            accruedDays = accruedDays - accrualRate + proRataDays;
          }
        } else if (accrualFrequency === 'Quarterly') {
          const monthsSinceFYStart = (currentDate.getFullYear() - fyStart.getFullYear()) * 12 + 
                                    (currentDate.getMonth() - fyStart.getMonth());
          const quartersSinceFYStart = Math.floor(Math.max(0, monthsSinceFYStart) / 3);
          const currentQuarterStart = new Date(currentDate.getFullYear(), Math.floor(currentDate.getMonth() / 3) * 3, accrualDate);
          if (currentDate >= currentQuarterStart && fyStart <= currentQuarterStart) {
            accruedDays = accrualRate * (quartersSinceFYStart + 1);
          } else {
            accruedDays = accrualRate * quartersSinceFYStart;
          }
        } else if (accrualFrequency === 'Yearly') {
          const fyAccrualDate = new Date(financialYear, 3, accrualDate);
          if (currentDate >= fyAccrualDate) {
            accruedDays = accrualRate;
          }
        } else if (accrualFrequency === 'None') {
          accruedDays = leavePolicy.daysPerYear;
        }

        accruedDays = Math.round(accruedDays * 10) / 10;
        accruedDays = Math.min(accruedDays, leavePolicy.daysPerYear);
      } else {
        accruedDays = leaveBalance.accrued || 0;
      }

      // Count approved leaves in current financial year
      const fyStart = new Date(financialYear, 3, 1);
      const fyEnd = new Date(financialYear + 1, 2, 31);
      
      const approvedLeaves = await LeaveRequest.aggregate([
        {
          $match: {
            tenantId: new mongoose.Types.ObjectId(req.tenantId),
            employeeId: new mongoose.Types.ObjectId(employee._id),
            leaveType: leavePolicy.leaveType,
            status: 'Approved',
            startDate: { $gte: fyStart, $lte: fyEnd },
          },
        },
        {
          $group: {
            _id: null,
            totalDays: { $sum: '$days' },
          },
        },
      ]);

      const usedDays = approvedLeaves.length > 0 ? approvedLeaves[0].totalDays : 0;
      const openingBalance = leaveBalance ? (leaveBalance.openingBalance || 0) : 0;
      const totalAccrued = openingBalance + accruedDays;
      availableDays = Math.max(0, totalAccrued - usedDays);

      // Apply max balance limit if configured
      if (leavePolicy.maxCarryForward && leavePolicy.maxCarryForward > 0) {
        availableDays = Math.min(availableDays, leavePolicy.maxCarryForward);
      }

      // Check if balance is 0 or insufficient
      if (availableDays <= 0) {
        return res.status(400).json({
          success: false,
          message: `Leave balance is 0. You cannot apply for ${normalizedLeaveType}. Please check your leave balance or contact HR.`,
        });
      }

      if (diffDays > availableDays) {
        return res.status(400).json({
          success: false,
          message: `Insufficient leave balance. Available: ${Math.round(availableDays * 10) / 10} days, Requested: ${diffDays} days`,
        });
      }
    }

    // Create leave request
    const leaveData = {
      tenantId: req.tenantId,
      employeeId: employee._id,
      leaveType: leaveType.trim(),
      startDate: start,
      endDate: end,
      days: diffDays,
      reason: reason.trim(),
      status: 'Pending',
      appliedDate: new Date(),
      isSandwichLeave: isSandwichLeave,
      sandwichLeaveDetails: sandwichDetails,
    };

    // Add medical certificate if provided
    if (req.body.medicalCertificate) {
      leaveData.medicalCertificate = {
        name: req.body.medicalCertificate.name,
        url: req.body.medicalCertificate.url,
        uploadedDate: new Date(),
        verified: false,
      };
    }

    // Add attachments if provided
    if (req.body.attachments && Array.isArray(req.body.attachments)) {
      leaveData.attachments = req.body.attachments.map(att => ({
        name: att.name,
        url: att.url,
        uploadedDate: new Date(),
      }));
    }

    console.log('Creating leave request:', {
      tenantId: req.tenantId,
      employeeId: employee._id,
      employeeEmail: employee.email,
      leaveType: leaveType,
      startDate: start,
      endDate: end,
      days: diffDays,
    });

    const leave = await LeaveRequest.create(leaveData);

    res.status(201).json({
      success: true,
      data: leave,
      message: 'Leave request submitted successfully',
    });
  } catch (error) {
    console.error('Create leave error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      body: req.body,
    });
    res.status(500).json({
      success: false,
      message: 'Server error while creating leave request',
      error: error.message,
    });
  }
};

// @desc    Update leave request
// @route   PUT /api/leaves/:id
// @access  Private
exports.updateLeave = async (req, res) => {
  try {
    let leave = await LeaveRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    // Recalculate days if dates changed
    if (req.body.startDate || req.body.endDate) {
      const start = new Date(req.body.startDate || leave.startDate);
      const end = new Date(req.body.endDate || leave.endDate);
      const diffTime = Math.abs(end - start);
      req.body.days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    leave = await LeaveRequest.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: leave,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete leave request
// @route   DELETE /api/leaves/:id
// @access  Private
exports.deleteLeave = async (req, res) => {
  try {
    const leave = await LeaveRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    await leave.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Leave request deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Approve/Reject leave request
// @route   PUT /api/leaves/:id/approve
// @access  Private (Manager, HR Admin, Tenant Admin)
exports.approveLeave = async (req, res) => {
  try {
    const { status, comments } = req.body;
    
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be Approved or Rejected',
      });
    }

    const leave = await LeaveRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('employeeId', 'firstName lastName employeeCode');

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    if (leave.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Leave request has already been processed',
      });
    }

    // BRD Requirement: Prevent self-approval
    // HR Administrator cannot approve their own leave - must be approved by Tenant Admin
    // Manager cannot approve their own leave
    // Check if approver is trying to approve their own leave
    const employee = await Employee.findById(leave.employeeId._id || leave.employeeId);
    
    if (employee && employee.email === req.user.email) {
      // Prevent self-approval for all roles
      return res.status(403).json({
        success: false,
        message: 'You cannot approve your own leave request.',
      });
    }

    // BRD Requirement: HR Admin's leave must be approved by Tenant Admin only
    // If the leave belongs to an HR Administrator, only Tenant Admin can approve
    if (employee) {
      // Find the user associated with this employee
      const User = require('../models/User');
      const employeeUser = await User.findOne({ 
        email: employee.email,
        tenantId: req.tenantId 
      });
      
      if (employeeUser && employeeUser.role === 'HR Administrator') {
        // Only Tenant Admin or Super Admin can approve HR Admin's leave
        if (req.user.role !== 'Tenant Admin' && req.user.role !== 'Super Admin') {
          return res.status(403).json({
            success: false,
            message: 'HR Administrator leave requests must be approved by Tenant Admin.',
          });
        }
      }
    }

    const previousStatus = leave.status;
    leave.status = status;
    leave.approverId = req.user._id;
    leave.approverName = req.user.name || req.user.email;
    if (comments) leave.comments = comments;
    leave.approvedDate = status === 'Approved' ? new Date() : undefined;
    
    // Mark as modified to ensure save triggers hooks
    leave.markModified('status');
    leave.markModified('approverId');
    leave.markModified('approverName');
    
    await leave.save();

    // BRD Requirement: Update leave balance when leave is approved/rejected
    if (status === 'Approved') {
      try {
        await updateLeaveBalance(
          leave.leaveType,
          leave.employeeId._id || leave.employeeId,
          req.tenantId,
          leave.days,
          'approve'
        );
      } catch (balanceError) {
        console.error('Error updating leave balance:', balanceError);
        // Don't fail the approval if balance update fails, but log it
      }
    } else if (status === 'Rejected' && previousStatus === 'Pending') {
      // If rejecting a pending leave, no balance change needed
      // But if cancelling an approved leave, we need to restore balance
    }

    console.log(`Leave ${leave._id} ${status.toLowerCase()} for employee ${leave.employeeId}. Days: ${leave.days}, Type: ${leave.leaveType}`);

    // BRD Requirement: Send notification to employee
    try {
      const employee = await Employee.findById(leave.employeeId._id || leave.employeeId);
      if (employee && employee.email) {
        if (status === 'Approved') {
          await sendNotification({
            to: employee.email,
            channels: ['email'],
            subject: `Leave Request Approved - ${leave.leaveType}`,
            message: `Your leave request for ${leave.leaveType} (${leave.days} days) from ${leave.startDate.toLocaleDateString()} to ${leave.endDate.toLocaleDateString()} has been approved.`,
            html: `
              <h2>Leave Request Approved</h2>
              <p>Dear ${employee.firstName} ${employee.lastName},</p>
              <p>Your leave request has been approved:</p>
              <ul>
                <li><strong>Leave Type:</strong> ${leave.leaveType}</li>
                <li><strong>Days:</strong> ${leave.days}</li>
                <li><strong>Start Date:</strong> ${leave.startDate.toLocaleDateString()}</li>
                <li><strong>End Date:</strong> ${leave.endDate.toLocaleDateString()}</li>
              </ul>
              ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
            `,
            tenantId: req.tenantId,
            userId: req.user._id,
            module: 'Leave Management',
            action: 'Leave Approved',
          });
        } else if (status === 'Rejected') {
          await sendNotification({
            to: employee.email,
            channels: ['email'],
            subject: `Leave Request Rejected - ${leave.leaveType}`,
            message: `Your leave request for ${leave.leaveType} (${leave.days} days) has been rejected.${comments ? ` Reason: ${comments}` : ''}`,
            html: `
              <h2>Leave Request Rejected</h2>
              <p>Dear ${employee.firstName} ${employee.lastName},</p>
              <p>Your leave request has been rejected:</p>
              <ul>
                <li><strong>Leave Type:</strong> ${leave.leaveType}</li>
                <li><strong>Days:</strong> ${leave.days}</li>
                <li><strong>Start Date:</strong> ${leave.startDate.toLocaleDateString()}</li>
                <li><strong>End Date:</strong> ${leave.endDate.toLocaleDateString()}</li>
              </ul>
              ${comments ? `<p><strong>Reason:</strong> ${comments}</p>` : ''}
            `,
            tenantId: req.tenantId,
            userId: req.user._id,
            module: 'Leave Management',
            action: 'Leave Rejected',
          });
        }
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
      // Don't fail leave approval if notification fails
    }

    res.status(200).json({
      success: true,
      data: leave,
      message: `Leave request ${status.toLowerCase()} successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Cancel leave request
// @route   PUT /api/leaves/:id/cancel
// @access  Private
exports.cancelLeave = async (req, res) => {
  try {
    const leave = await LeaveRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('employeeId', 'firstName lastName employeeCode email');

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    // Only allow cancellation if status is Pending or Approved
    if (leave.status === 'Cancelled' || leave.status === 'Rejected') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel leave with status: ${leave.status}`,
      });
    }

    // If approved, restore leave balance
    if (leave.status === 'Approved') {
      try {
        await updateLeaveBalance(
          leave.leaveType,
          leave.employeeId._id || leave.employeeId,
          req.tenantId,
          leave.days,
          'cancel'
        );
      } catch (balanceError) {
        console.error('Error restoring leave balance:', balanceError);
      }
    }

    leave.status = 'Cancelled';
    leave.cancelledDate = new Date();
    leave.cancelledBy = req.user._id;
    if (req.body.cancellationReason) {
      leave.cancellationReason = req.body.cancellationReason;
    }
    await leave.save();

    res.status(200).json({
      success: true,
      data: leave,
      message: 'Leave request cancelled successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get team calendar (leaves for team members)
// @route   GET /api/leaves/team-calendar
// @access  Private (Manager, HR Admin)
exports.getTeamCalendar = async (req, res) => {
  try {
    const { startDate, endDate, employeeId } = req.query;

    let filter = { tenantId: req.tenantId, status: 'Approved' };

    // If employeeId provided, get that employee's leaves
    if (employeeId) {
      filter.employeeId = employeeId;
    } else if (req.user.role === 'Manager') {
      // Manager sees team members' leaves
      const teamMembers = await Employee.find({
        tenantId: req.tenantId,
        reportingManager: req.user._id,
      }).select('_id');
      filter.employeeId = { $in: teamMembers.map((e) => e._id) };
    }
    // HR Admin and Tenant Admin see all leaves (no employeeId filter)

    if (startDate && endDate) {
      filter.$or = [
        { startDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
        { endDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
        {
          startDate: { $lte: new Date(startDate) },
          endDate: { $gte: new Date(endDate) },
        },
      ];
    }

    const leaves = await LeaveRequest.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode department designation')
      .sort({ startDate: 1 });

    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
