const EmployeeFamilyDetail = require('../models/EmployeeFamilyDetail');
const AuditLog = require('../models/AuditLog');

// @desc    Get family details for an employee
// @route   GET /api/employees/:employeeId/family-details
// @access  Private
exports.getEmployeeFamilyDetails = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const familyDetails = await EmployeeFamilyDetail.findOne({
      tenantId: req.tenantId,
      employeeId: employeeId,
    });

    if (!familyDetails) {
      return res.status(404).json({
        success: false,
        message: 'Family details not found',
      });
    }

    res.status(200).json({
      success: true,
      data: familyDetails,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create or update family details
// @route   POST /api/employees/:employeeId/family-details
// @route   PUT /api/employees/:employeeId/family-details
// @access  Private (HR Admin, Tenant Admin, Employee - own details)
exports.upsertFamilyDetails = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    if (req.user.role === 'Employee') {
      const Employee = require('../models/Employee');
      const employee = await Employee.findOne({
        _id: employeeId,
        email: req.user.email,
        tenantId: req.tenantId,
      });
      
      if (!employee) {
        return res.status(403).json({
          success: false,
          message: 'Access denied.',
        });
      }
    }

    req.body.tenantId = req.tenantId;
    req.body.employeeId = employeeId;

    // Upsert (update if exists, create if not)
    const familyDetails = await EmployeeFamilyDetail.findOneAndUpdate(
      {
        tenantId: req.tenantId,
        employeeId: employeeId,
      },
      req.body,
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: familyDetails.isNew ? 'Create' : 'Update',
        module: 'Employee Management',
        entityType: 'EmployeeFamilyDetail',
        entityId: familyDetails._id,
        details: `${familyDetails.isNew ? 'Created' : 'Updated'} family details for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(familyDetails.isNew ? 201 : 200).json({
      success: true,
      data: familyDetails,
      message: `Family details ${familyDetails.isNew ? 'created' : 'updated'} successfully`,
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

// @desc    Delete family details
// @route   DELETE /api/employees/:employeeId/family-details
// @access  Private (HR Admin, Tenant Admin)
exports.deleteFamilyDetails = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const familyDetails = await EmployeeFamilyDetail.findOne({
      tenantId: req.tenantId,
      employeeId: employeeId,
    });

    if (!familyDetails) {
      return res.status(404).json({
        success: false,
        message: 'Family details not found',
      });
    }

    await familyDetails.deleteOne();

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Delete',
        module: 'Employee Management',
        entityType: 'EmployeeFamilyDetail',
        entityId: familyDetails._id,
        details: `Deleted family details for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(200).json({
      success: true,
      message: 'Family details deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
