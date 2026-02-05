const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Job = require('../models/Job');
const LeaveRequest = require('../models/LeaveRequest');
const Expense = require('../models/Expense');
const Payroll = require('../models/Payroll');
const mongoose = require('mongoose');

// @desc    Get dashboard statistics for Tenant Admin
// @route   GET /api/reports/dashboard-stats
// @access  Private (Tenant Admin, Super Admin)
exports.getDashboardStats = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // 1. Employee Stats
    const totalEmployees = await Employee.countDocuments({ tenantId, status: 'Active' });
    
    // New joinings this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const newJoinings = await Employee.countDocuments({
      tenantId,
      joinDate: { $gte: startOfMonth }
    });

    // 2. Department Distribution
    const departmentDistribution = await Employee.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), status: 'Active' } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $project: { name: '$_id', value: '$count', _id: 0 } }
    ]);

    // Add fill colors for charts
    const colors = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
    const departmentData = departmentDistribution.map((dept, index) => ({
      ...dept,
      fill: colors[index % colors.length]
    }));

    // 3. Pending Approvals
    const pendingLeaves = await LeaveRequest.countDocuments({ tenantId, status: 'Pending' });
    const pendingExpenses = await Expense.countDocuments({ tenantId, status: 'Pending' });

    // 4. Open Positions
    const openJobs = await Job.find({ tenantId, status: 'Open' });
    const openPositionsCount = openJobs.reduce((sum, job) => sum + (job.openPositions || 0), 0);
    const totalApplications = openJobs.reduce((sum, job) => sum + (job.applications?.length || 0), 0);

    // 5. Financial Stats (Monthly Cost - Last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyFinancials = await Payroll.aggregate([
      { 
        $match: { 
          tenantId: new mongoose.Types.ObjectId(tenantId),
          createdAt: { $gte: sixMonthsAgo } 
        } 
      },
      {
        $group: {
          _id: { month: '$month', year: '$year' },
          totalPayroll: { $sum: '$netSalary' }
        }
      }
    ]);

    // Get expenses for same period
    const monthlyExpenses = await Expense.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          status: 'Approved',
          date: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: { 
            month: { $month: '$date' }, 
            year: { $year: '$date' } 
          },
          totalExpenses: { $sum: '$amount' }
        }
      }
    ]);

    // Merge and format for chart
    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthNamesFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    const financialData = [];
    const today = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const mIndex = d.getMonth();
      const year = d.getFullYear();
      const mNameShort = monthNamesShort[mIndex];

      const payrollEntry = monthlyFinancials.find(p => {
        const pMonth = p._id.month;
        const pYear = p._id.year;
        if (pYear !== year) return false;
        if (typeof pMonth === 'number') return pMonth === mIndex + 1;
        if (typeof pMonth === 'string') {
          return pMonth.toLowerCase() === monthNamesFull[mIndex].toLowerCase() || 
                 pMonth.toLowerCase() === mNameShort.toLowerCase() ||
                 parseInt(pMonth) === mIndex + 1;
        }
        return false;
      });

      const expenseEntry = monthlyExpenses.find(e => {
        return e._id.year === year && e._id.month === mIndex + 1;
      });

      const payrollAmount = payrollEntry ? payrollEntry.totalPayroll : 0;
      const expenseAmount = expenseEntry ? expenseEntry.totalExpenses : 0;

      financialData.push({
        month: mNameShort,
        revenue: 0,
        expenses: payrollAmount + expenseAmount,
        payroll: payrollAmount,
        otherExpenses: expenseAmount
      });
    }

    res.status(200).json({
      success: true,
      data: {
        totalEmployees,
        newJoinings,
        pendingApprovals: {
          leaves: pendingLeaves,
          expenses: pendingExpenses,
          onboarding: 0
        },
        openPositions: openPositionsCount,
        applications: totalApplications,
        departmentData,
        financialData
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get comprehensive reports data
// @route   GET /api/reports/comprehensive
// @access  Private (Tenant Admin, HR Administrator, Payroll Administrator, Finance Administrator, Auditor)
exports.getComprehensiveReports = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // 1. Headcount Trend (Last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const headcountData = [];
    const today = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      const mNameShort = monthNamesShort[d.getMonth()];

      // Count active employees at end of that month
      const employeesAtMonthEnd = await Employee.countDocuments({
        tenantId,
        status: 'Active',
        joinDate: { $lte: endOfMonth }
      });

      // Count employees who left (status changed to Inactive/Retired) during that month
      // This is approximate - we'd need a better tracking mechanism
      const attrition = 0; // Placeholder - would need exit tracking

      headcountData.push({
        month: mNameShort,
        employees: employeesAtMonthEnd,
        attrition: attrition
      });
    }

    // 2. Department Distribution (already calculated in dashboard stats, reuse logic)
    const departmentDistribution = await Employee.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), status: 'Active' } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $project: { name: '$_id', employees: '$count', _id: 0 } }
    ]);

    // 3. Leave Distribution (by leave type)
    const leaveDistribution = await LeaveRequest.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          status: 'Approved'
        }
      },
      {
        $group: {
          _id: '$leaveType',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          type: '$_id',
          count: '$count',
          _id: 0
        }
      }
    ]);

    // 4. Performance Data (if Performance model exists)
    // Placeholder - would need Performance/Appraisal model
    const performanceData = [];

    // 5. Payroll Summary (Current Month)
    const currentMonth = today.toLocaleString('default', { month: 'long' });
    const currentYear = today.getFullYear();
    
    const currentMonthPayroll = await Payroll.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          $or: [
            { month: currentMonth },
            { month: monthNamesShort[today.getMonth()] },
            { year: currentYear }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalPayroll: { $sum: '$netSalary' },
          totalBasic: { $sum: '$basicSalary' },
          totalDeductions: { $sum: { $add: ['$pfDeduction', '$esiDeduction', '$incomeTax'] } },
          count: { $sum: 1 }
        }
      }
    ]);

    const payrollSummary = currentMonthPayroll.length > 0 ? {
      totalPayroll: currentMonthPayroll[0].totalPayroll || 0,
      averageSalary: currentMonthPayroll[0].count > 0 ? (currentMonthPayroll[0].totalPayroll / currentMonthPayroll[0].count) : 0,
      totalDeductions: currentMonthPayroll[0].totalDeductions || 0
    } : {
      totalPayroll: 0,
      averageSalary: 0,
      totalDeductions: 0
    };

    // 6. Attrition Rate (approximate)
    const totalActive = await Employee.countDocuments({ tenantId, status: 'Active' });
    const totalInactive = await Employee.countDocuments({ tenantId, status: { $in: ['Inactive', 'Retired'] } });
    const attritionRate = totalActive + totalInactive > 0 
      ? ((totalInactive / (totalActive + totalInactive)) * 100).toFixed(1)
      : '0.0';

    // 7. Leave Utilization (approximate)
    const totalLeaveDays = await LeaveRequest.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          status: 'Approved'
        }
      },
      {
        $group: {
          _id: null,
          totalDays: { $sum: '$days' }
        }
      }
    ]);

    const leaveUtilization = totalLeaveDays.length > 0 ? totalLeaveDays[0].totalDays : 0;
    // Assuming average entitlement per employee (would need leave policy data)
    const avgEntitlement = totalActive * 20; // Placeholder
    const utilizationPercent = avgEntitlement > 0 ? Math.round((leaveUtilization / avgEntitlement) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        headcountData,
        departmentData: departmentDistribution,
        leaveData: leaveDistribution,
        performanceData,
        payrollSummary,
        metrics: {
          totalEmployees: totalActive,
          attritionRate: parseFloat(attritionRate),
          avgRating: 0, // Placeholder - would need performance data
          leaveUtilization: utilizationPercent
        }
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
