const Performance = require('../models/Performance');
const Employee = require('../models/Employee');

// @desc    Get all performance records
// @route   GET /api/performance
// @access  Private
exports.getPerformances = async (req, res) => {
  try {
    const { employeeId, period, status } = req.query;
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

    if (period) filter.period = period;
    if (status) filter.status = status;

    const performances = await Performance.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode department designation')
      .populate('raterId', 'name email')
      .sort({ reviewDate: -1 });

    res.status(200).json({
      success: true,
      count: performances.length,
      data: performances,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single performance record
// @route   GET /api/performance/:id
// @access  Private
exports.getPerformance = async (req, res) => {
  try {
    const performance = await Performance.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    })
      .populate('employeeId', 'firstName lastName employeeCode department designation email')
      .populate('raterId', 'name email');

    if (!performance) {
      return res.status(404).json({
        success: false,
        message: 'Performance record not found',
      });
    }

    // Security Check: If user is Employee, ensure it belongs to them
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ 
        email: req.user.email,
        tenantId: req.tenantId 
      });
      
      if (!employee || performance.employeeId._id.toString() !== employee._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this performance record',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: performance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create performance record
// @route   POST /api/performance
// @access  Private (Manager, HR Admin, Tenant Admin)
exports.createPerformance = async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required',
      });
    }

    req.body.tenantId = req.tenantId;
    req.body.raterId = req.user._id;
    req.body.raterName = req.user.name || req.user.email;

    const performance = await Performance.create(req.body);

    res.status(201).json({
      success: true,
      data: performance,
    });
  } catch (error) {
    console.error('Error creating performance:', error);
    
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

// @desc    Update performance record
// @route   PUT /api/performance/:id
// @access  Private (Manager, HR Admin, Tenant Admin)
exports.updatePerformance = async (req, res) => {
  try {
    let performance = await Performance.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!performance) {
      return res.status(404).json({
        success: false,
        message: 'Performance record not found',
      });
    }

    performance = await Performance.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: performance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete performance record
// @route   DELETE /api/performance/:id
// @access  Private (HR Admin, Tenant Admin)
exports.deletePerformance = async (req, res) => {
  try {
    const performance = await Performance.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!performance) {
      return res.status(404).json({
        success: false,
        message: 'Performance record not found',
      });
    }

    await performance.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Performance record deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
