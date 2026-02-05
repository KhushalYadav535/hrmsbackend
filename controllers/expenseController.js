const Expense = require('../models/Expense');

// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
exports.getExpenses = async (req, res) => {
  try {
    const { employeeId, status, category } = req.query;
    const filter = { tenantId: req.tenantId };

    if (employeeId) filter.employeeId = employeeId;
    if (status) filter.status = status;
    if (category) filter.category = category;

    // If manager, show team member expenses
    if (req.user.role === 'Manager' && !employeeId) {
      const Employee = require('../models/Employee');
      const teamMembers = await Employee.find({
        tenantId: req.tenantId,
        reportingManager: req.user._id,
      }).select('_id');
      filter.employeeId = { $in: teamMembers.map((e) => e._id) };
    }

    const expenses = await Expense.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode')
      .populate('approverId', 'name email')
      .sort({ submittedDate: -1 });

    res.status(200).json({
      success: true,
      count: expenses.length,
      data: expenses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single expense
// @route   GET /api/expenses/:id
// @access  Private
exports.getExpense = async (req, res) => {
  try {
    const expense = await Expense.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    })
      .populate('employeeId', 'firstName lastName employeeCode email')
      .populate('approverId', 'name email');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found',
      });
    }

    res.status(200).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create expense
// @route   POST /api/expenses
// @access  Private
exports.createExpense = async (req, res) => {
  try {
    req.body.tenantId = req.tenantId;
    req.body.employeeId = req.body.employeeId || req.user._id;

    const expense = await Expense.create(req.body);

    res.status(201).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update expense
// @route   PUT /api/expenses/:id
// @access  Private
exports.updateExpense = async (req, res) => {
  try {
    let expense = await Expense.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found',
      });
    }

    expense = await Expense.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Approve/Reject expense
// @route   PUT /api/expenses/:id/approve
// @access  Private (Manager, HR Admin, Finance Admin)
exports.approveExpense = async (req, res) => {
  try {
    const { status, comments } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be Approved or Rejected',
      });
    }

    const expense = await Expense.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found',
      });
    }

    expense.status = status;
    expense.approverId = req.user._id;
    expense.approverName = req.user.name;
    if (comments) expense.comments = comments;

    await expense.save();

    res.status(200).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found',
      });
    }

    await expense.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Expense deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
