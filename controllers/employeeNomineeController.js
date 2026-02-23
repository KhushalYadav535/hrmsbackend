const EmployeeNominee = require('../models/EmployeeNominee');
const AuditLog = require('../models/AuditLog');

// @desc    Get all nominees for an employee
// @route   GET /api/employees/:employeeId/nominees
// @access  Private
exports.getEmployeeNominees = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { nomineeType } = req.query;
    
    const filter = {
      tenantId: req.tenantId,
      employeeId: employeeId,
    };
    
    if (nomineeType && ['PF', 'Gratuity', 'Both'].includes(nomineeType)) {
      filter.nomineeType = nomineeType;
    }
    
    const nominees = await EmployeeNominee.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: nominees.length,
      data: nominees,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create nominee
// @route   POST /api/employees/:employeeId/nominees
// @access  Private (HR Admin, Tenant Admin, Employee - own nominees)
exports.createNominee = async (req, res) => {
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

    const nominee = await EmployeeNominee.create(req.body);

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Create',
        module: 'Employee Management',
        entityType: 'EmployeeNominee',
        entityId: nominee._id,
        details: `Created nominee for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(201).json({
      success: true,
      data: nominee,
      message: 'Nominee created successfully',
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

// @desc    Update nominee
// @route   PUT /api/employees/:employeeId/nominees/:id
// @access  Private (HR Admin, Tenant Admin, Employee - own nominees)
exports.updateNominee = async (req, res) => {
  try {
    const { employeeId, id } = req.params;
    
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

    const nominee = await EmployeeNominee.findOneAndUpdate(
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

    if (!nominee) {
      return res.status(404).json({
        success: false,
        message: 'Nominee not found',
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
        entityType: 'EmployeeNominee',
        entityId: nominee._id,
        details: `Updated nominee for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(200).json({
      success: true,
      data: nominee,
      message: 'Nominee updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete nominee
// @route   DELETE /api/employees/:employeeId/nominees/:id
// @access  Private (HR Admin, Tenant Admin, Employee - own nominees)
exports.deleteNominee = async (req, res) => {
  try {
    const { employeeId, id } = req.params;
    
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

    const nominee = await EmployeeNominee.findOne({
      _id: id,
      tenantId: req.tenantId,
      employeeId: employeeId,
    });

    if (!nominee) {
      return res.status(404).json({
        success: false,
        message: 'Nominee not found',
      });
    }

    await nominee.deleteOne();

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Delete',
        module: 'Employee Management',
        entityType: 'EmployeeNominee',
        entityId: nominee._id,
        details: `Deleted nominee for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(200).json({
      success: true,
      message: 'Nominee deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
