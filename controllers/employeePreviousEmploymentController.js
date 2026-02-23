const EmployeePreviousEmployment = require('../models/EmployeePreviousEmployment');
const AuditLog = require('../models/AuditLog');

// @desc    Get all previous employments for an employee
// @route   GET /api/employees/:employeeId/previous-employments
// @access  Private
exports.getEmployeePreviousEmployments = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const previousEmployments = await EmployeePreviousEmployment.find({
      tenantId: req.tenantId,
      employeeId: employeeId,
    }).sort({ startDate: -1 });

    res.status(200).json({
      success: true,
      count: previousEmployments.length,
      data: previousEmployments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create previous employment
// @route   POST /api/employees/:employeeId/previous-employments
// @access  Private (HR Admin, Tenant Admin)
exports.createPreviousEmployment = async (req, res) => {
  try {
    const { employeeId } = req.params;

    req.body.tenantId = req.tenantId;
    req.body.employeeId = employeeId;

    const previousEmployment = await EmployeePreviousEmployment.create(req.body);

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Create',
        module: 'Employee Management',
        entityType: 'EmployeePreviousEmployment',
        entityId: previousEmployment._id,
        details: `Created previous employment record for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(201).json({
      success: true,
      data: previousEmployment,
      message: 'Previous employment record created successfully',
    });
  } catch (error) {
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

// @desc    Update previous employment
// @route   PUT /api/employees/:employeeId/previous-employments/:id
// @access  Private (HR Admin, Tenant Admin)
exports.updatePreviousEmployment = async (req, res) => {
  try {
    const { employeeId, id } = req.params;

    const previousEmployment = await EmployeePreviousEmployment.findOneAndUpdate(
      {
        _id: id,
        tenantId: req.tenantId,
        employeeId: employeeId,
      },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!previousEmployment) {
      return res.status(404).json({
        success: false,
        message: 'Previous employment record not found',
      });
    }

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Update',
        module: 'Employee Management',
        entityType: 'EmployeePreviousEmployment',
        entityId: previousEmployment._id,
        details: `Updated previous employment record for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(200).json({
      success: true,
      data: previousEmployment,
      message: 'Previous employment record updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete previous employment
// @route   DELETE /api/employees/:employeeId/previous-employments/:id
// @access  Private (HR Admin, Tenant Admin)
exports.deletePreviousEmployment = async (req, res) => {
  try {
    const { employeeId, id } = req.params;

    const previousEmployment = await EmployeePreviousEmployment.findOne({
      _id: id,
      tenantId: req.tenantId,
      employeeId: employeeId,
    });

    if (!previousEmployment) {
      return res.status(404).json({
        success: false,
        message: 'Previous employment record not found',
      });
    }

    await previousEmployment.deleteOne();

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Delete',
        module: 'Employee Management',
        entityType: 'EmployeePreviousEmployment',
        entityId: previousEmployment._id,
        details: `Deleted previous employment record for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(200).json({
      success: true,
      message: 'Previous employment record deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
