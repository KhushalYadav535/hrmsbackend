const LeaveBalance = require('../models/LeaveBalance');
const LeavePolicy = require('../models/LeavePolicy');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');

// @desc    Accrue leaves for all employees (scheduled job - run on 1st of every month)
// @route   POST /api/leaves/accrue
// @access  Private (System/HR Administrator only)
// BRD Requirement: "Automatically accrue leaves on scheduled dates (1st of every month)"
exports.accrueLeaves = async (req, res) => {
  try {
    // BRD Requirement: Only HR Admin or System Admin can trigger accrual
    if (req.user.role !== 'HR Administrator' && 
        req.user.role !== 'Tenant Admin' && 
        req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only HR Administrators can accrue leaves.',
      });
    }

    const { month, year } = req.body;
    const accrualDate = month && year 
      ? new Date(year, ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'].indexOf(month), 1)
      : new Date();

    const currentYear = accrualDate.getFullYear();
    const financialYear = accrualDate.getMonth() >= 3 ? currentYear : currentYear - 1; // FY starts April

    // Get all active employees
    const employees = await Employee.find({
      tenantId: req.tenantId,
      status: 'Active',
    });

    // Get all active leave policies
    const leavePolicies = await LeavePolicy.find({
      tenantId: req.tenantId,
      status: 'Active',
    });

    if (leavePolicies.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active leave policies found. Please configure leave policies first.',
      });
    }

    const accrualResults = {
      success: [],
      errors: [],
      totalProcessed: 0,
    };

    for (const employee of employees) {
      for (const policy of leavePolicies) {
        try {
          // Calculate pro-rata accrual for new joiners
          const joinDate = new Date(employee.joinDate);
          const monthsSinceJoining = (accrualDate.getFullYear() - joinDate.getFullYear()) * 12 + 
                                    (accrualDate.getMonth() - joinDate.getMonth());
          
          // Calculate accrual based on policy settings
          let accrualDays = 0;
          
          // Use accrual settings from policy if available, otherwise default to monthly
          const accrualFrequency = policy.accrualFrequency || 'Monthly';
          const accrualRate = policy.accrualRate || (policy.daysPerYear / 12);
          
          if (accrualFrequency === 'None') {
            // No accrual for this policy
            continue;
          } else if (accrualFrequency === 'Monthly') {
            accrualDays = accrualRate;
            
            // Pro-rata for first month if employee joined in current month
            if (monthsSinceJoining === 0) {
              const daysInMonth = new Date(accrualDate.getFullYear(), accrualDate.getMonth() + 1, 0).getDate();
              const daysWorked = daysInMonth - joinDate.getDate() + 1;
              accrualDays = accrualRate * (daysWorked / daysInMonth);
            }
          } else if (accrualFrequency === 'Quarterly') {
            // Only accrue on quarter start months (Jan, Apr, Jul, Oct)
            const quarterStartMonths = [0, 3, 6, 9]; // 0-indexed
            if (quarterStartMonths.includes(accrualDate.getMonth())) {
              accrualDays = accrualRate;
            }
          } else if (accrualFrequency === 'Yearly') {
            // Only accrue on financial year start (April)
            if (accrualDate.getMonth() === 3) { // April = 3 (0-indexed)
              accrualDays = accrualRate;
            }
          }

          // Find or create leave balance
          let leaveBalance = await LeaveBalance.findOne({
            tenantId: req.tenantId,
            employeeId: employee._id,
            leaveType: policy.leaveType,
            financialYear: financialYear,
          });

          if (!leaveBalance) {
            // First accrual for this leave type in this FY
            leaveBalance = await LeaveBalance.create({
              tenantId: req.tenantId,
              employeeId: employee._id,
              leaveType: policy.leaveType,
              financialYear: financialYear,
              openingBalance: 0,
              accrued: Math.round(accrualDays * 10) / 10, // Round to 1 decimal
              used: 0,
              maxBalance: policy.maxBalance || policy.daysPerYear,
              lastAccrualDate: accrualDate,
            });
          } else {
            // Update existing balance
            leaveBalance.accrued = Math.round((leaveBalance.accrued + accrualDays) * 10) / 10;
            leaveBalance.lastAccrualDate = accrualDate;
            
            // Apply max balance limit
            const totalBalance = leaveBalance.openingBalance + leaveBalance.accrued;
            if (totalBalance > leaveBalance.maxBalance) {
              leaveBalance.accrued = leaveBalance.maxBalance - leaveBalance.openingBalance;
            }
            
            await leaveBalance.save();
          }

          accrualResults.success.push({
            employeeId: employee._id,
            employeeCode: employee.employeeCode,
            leaveType: policy.leaveType,
            accruedDays: accrualDays,
            currentBalance: leaveBalance.currentBalance,
          });

        } catch (error) {
          accrualResults.errors.push({
            employeeId: employee._id,
            employeeCode: employee.employeeCode,
            leaveType: policy.leaveType,
            error: error.message,
          });
        }
      }
      accrualResults.totalProcessed++;
    }

    // Create audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'Accrue',
      module: 'Leave Management',
      entityType: 'Leave Balance',
      details: `Leave accrual completed for ${accrualResults.totalProcessed} employees. Month: ${month || 'Current'}, Year: ${year || 'Current'}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    res.status(200).json({
      success: true,
      message: `Leave accrual completed for ${accrualResults.totalProcessed} employees`,
      data: accrualResults,
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
    const { financialYear } = req.query;
    
    const currentYear = new Date().getFullYear();
    const fy = financialYear || (new Date().getMonth() >= 3 ? currentYear : currentYear - 1);

    // Verify employee belongs to tenant
    const employee = await Employee.findOne({
      _id: employeeId,
      tenantId: req.tenantId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Get leave balances
    const balances = await LeaveBalance.find({
      tenantId: req.tenantId,
      employeeId: employeeId,
      financialYear: parseInt(fy),
    }).sort({ leaveType: 1 });

    res.status(200).json({
      success: true,
      data: balances,
      financialYear: fy,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update leave balance (when leave is approved/rejected)
// @route   PUT /api/leaves/balance/:employeeId
// @access  Private (Internal - called by leave approval)
exports.updateLeaveBalance = async (leaveType, employeeId, tenantId, days, action) => {
  try {
    const currentYear = new Date().getFullYear();
    const financialYear = new Date().getMonth() >= 3 ? currentYear : currentYear - 1;

    const leaveBalance = await LeaveBalance.findOne({
      tenantId,
      employeeId,
      leaveType,
      financialYear,
    });

    if (!leaveBalance) {
      // Create balance if doesn't exist (shouldn't happen if accrual is running)
      return await LeaveBalance.create({
        tenantId,
        employeeId,
        leaveType,
        financialYear,
        openingBalance: 0,
        accrued: 0,
        used: action === 'approve' ? days : 0,
        maxBalance: 0,
      });
    }

    if (action === 'approve') {
      leaveBalance.used = (leaveBalance.used || 0) + days;
    } else if (action === 'reject' || action === 'cancel') {
      leaveBalance.used = Math.max(0, (leaveBalance.used || 0) - days);
    }

    await leaveBalance.save();
    return leaveBalance;

  } catch (error) {
    console.error('Error updating leave balance:', error);
    throw error;
  }
};
