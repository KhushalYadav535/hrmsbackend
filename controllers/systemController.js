const User = require('../models/User');
const Employee = require('../models/Employee');
const LeaveRequest = require('../models/LeaveRequest');
const mongoose = require('mongoose');

// @desc    Get system status
// @route   GET /api/system/status
// @access  Private (Tenant Admin)
exports.getSystemStatus = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';

    // Get active users count
    const activeUsers = await User.countDocuments({ tenantId, status: 'Active' });

    // Get pending tasks (leaves + expenses)
    const pendingLeaves = await LeaveRequest.countDocuments({ tenantId, status: 'Pending' });
    const Expense = require('../models/Expense');
    const pendingExpenses = await Expense.countDocuments({ tenantId, status: 'Pending' });
    const pendingTasks = pendingLeaves + pendingExpenses;

    res.status(200).json({
      success: true,
      data: {
        systemStatus: 'Operational',
        database: dbStatus,
        activeUsers: activeUsers.toLocaleString(),
        pendingTasks: pendingTasks.toString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
