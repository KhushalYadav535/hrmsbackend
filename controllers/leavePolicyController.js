const LeavePolicy = require('../models/LeavePolicy');

// @desc    Get all leave policies
// @route   GET /api/leave-policies
// @access  Private
exports.getLeavePolicies = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status) filter.status = status;

    // Ensure only policies for current tenant are returned
    const policies = await LeavePolicy.find(filter).sort({ leaveType: 1 });

    // Log for debugging - ensure tenant filtering is working
    console.log(`[getLeavePolicies] Tenant ID: ${req.tenantId}, Status filter: ${status || 'all'}, Found ${policies.length} policies`);
    if (policies.length > 0) {
      console.log(`[getLeavePolicies] Policies:`, policies.map(p => p.leaveType).join(', '));
    }

    res.status(200).json({
      success: true,
      count: policies.length,
      data: policies,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single leave policy
// @route   GET /api/leave-policies/:id
// @access  Private
exports.getLeavePolicy = async (req, res) => {
  try {
    const policy = await LeavePolicy.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Leave policy not found',
      });
    }

    res.status(200).json({
      success: true,
      data: policy,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create leave policy
// @route   POST /api/leave-policies
// @access  Private (Tenant Admin, HR Administrator)
exports.createLeavePolicy = async (req, res) => {
  try {
    req.body.tenantId = req.tenantId;

    const { leaveType, daysPerYear } = req.body;

    if (!leaveType || daysPerYear === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide leaveType and daysPerYear',
      });
    }

    // Check for duplicate leave type within tenant
    const existingPolicy = await LeavePolicy.findOne({
      tenantId: req.tenantId,
      leaveType: leaveType.trim(),
    });

    if (existingPolicy) {
      return res.status(400).json({
        success: false,
        message: `Leave policy for "${leaveType}" already exists`,
      });
    }

    const policy = await LeavePolicy.create(req.body);

    res.status(201).json({
      success: true,
      data: policy,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update leave policy
// @route   PUT /api/leave-policies/:id
// @access  Private (Tenant Admin, HR Administrator)
exports.updateLeavePolicy = async (req, res) => {
  try {
    const policy = await LeavePolicy.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Leave policy not found',
      });
    }

    // Check for duplicate leave type if leaveType is being changed
    if (req.body.leaveType && req.body.leaveType !== policy.leaveType) {
      const existingPolicy = await LeavePolicy.findOne({
        tenantId: req.tenantId,
        leaveType: req.body.leaveType.trim(),
        _id: { $ne: req.params.id },
      });

      if (existingPolicy) {
        return res.status(400).json({
          success: false,
          message: `Leave policy for "${req.body.leaveType}" already exists`,
        });
      }
    }

    Object.assign(policy, req.body);
    await policy.save();

    res.status(200).json({
      success: true,
      data: policy,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete leave policy
// @route   DELETE /api/leave-policies/:id
// @access  Private (Tenant Admin, HR Administrator)
exports.deleteLeavePolicy = async (req, res) => {
  try {
    const policy = await LeavePolicy.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Leave policy not found',
      });
    }

    await policy.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Leave policy deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
