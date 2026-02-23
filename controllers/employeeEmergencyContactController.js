const EmployeeEmergencyContact = require('../models/EmployeeEmergencyContact');
const AuditLog = require('../models/AuditLog');

// @desc    Get all emergency contacts for an employee
// @route   GET /api/employees/:employeeId/emergency-contacts
// @access  Private
exports.getEmployeeEmergencyContacts = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const contacts = await EmployeeEmergencyContact.find({
      tenantId: req.tenantId,
      employeeId: employeeId,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create emergency contact
// @route   POST /api/employees/:employeeId/emergency-contacts
// @access  Private (HR Admin, Tenant Admin, Employee - own contacts)
exports.createEmergencyContact = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    // Security: Employee can only create their own emergency contacts
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
          message: 'Access denied. You can only manage your own emergency contacts.',
        });
      }
    }

    req.body.tenantId = req.tenantId;
    req.body.employeeId = employeeId;

    const contact = await EmployeeEmergencyContact.create(req.body);

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Create',
        module: 'Employee Management',
        entityType: 'EmployeeEmergencyContact',
        entityId: contact._id,
        details: `Created emergency contact for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(201).json({
      success: true,
      data: contact,
      message: 'Emergency contact created successfully',
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

// @desc    Update emergency contact
// @route   PUT /api/employees/:employeeId/emergency-contacts/:id
// @access  Private (HR Admin, Tenant Admin, Employee - own contacts)
exports.updateEmergencyContact = async (req, res) => {
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

    const contact = await EmployeeEmergencyContact.findOneAndUpdate(
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

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found',
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
        entityType: 'EmployeeEmergencyContact',
        entityId: contact._id,
        details: `Updated emergency contact for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(200).json({
      success: true,
      data: contact,
      message: 'Emergency contact updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete emergency contact
// @route   DELETE /api/employees/:employeeId/emergency-contacts/:id
// @access  Private (HR Admin, Tenant Admin, Employee - own contacts)
exports.deleteEmergencyContact = async (req, res) => {
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

    const contact = await EmployeeEmergencyContact.findOne({
      _id: id,
      tenantId: req.tenantId,
      employeeId: employeeId,
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found',
      });
    }

    await contact.deleteOne();

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Delete',
        module: 'Employee Management',
        entityType: 'EmployeeEmergencyContact',
        entityId: contact._id,
        details: `Deleted emergency contact for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(200).json({
      success: true,
      message: 'Emergency contact deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
