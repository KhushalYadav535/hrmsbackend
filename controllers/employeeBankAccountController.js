const EmployeeBankAccount = require('../models/EmployeeBankAccount');
const AuditLog = require('../models/AuditLog');
const { maskBankAccountData, maskArray } = require('../utils/masking');

// @desc    Get all bank accounts for an employee
// @route   GET /api/employees/:employeeId/bank-accounts
// @access  Private
exports.getEmployeeBankAccounts = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const bankAccounts = await EmployeeBankAccount.find({
      tenantId: req.tenantId,
      employeeId: employeeId,
    }).sort({ isPrimary: -1, createdAt: -1 });

    // Mask sensitive data
    const maskedAccounts = maskArray(bankAccounts, maskBankAccountData);

    res.status(200).json({
      success: true,
      count: maskedAccounts.length,
      data: maskedAccounts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single bank account
// @route   GET /api/employees/:employeeId/bank-accounts/:id
// @access  Private
exports.getBankAccount = async (req, res) => {
  try {
    const { employeeId, id } = req.params;
    
    const bankAccount = await EmployeeBankAccount.findOne({
      _id: id,
      tenantId: req.tenantId,
      employeeId: employeeId,
    });

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found',
      });
    }

    // Mask sensitive data
    const maskedAccount = maskBankAccountData(bankAccount);

    res.status(200).json({
      success: true,
      data: maskedAccount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create bank account
// @route   POST /api/employees/:employeeId/bank-accounts
// @access  Private (HR Admin, Tenant Admin, Employee - own account)
exports.createBankAccount = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    // Security: Employee can only create their own bank accounts
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
          message: 'Access denied. You can only manage your own bank accounts.',
        });
      }
    }

    req.body.tenantId = req.tenantId;
    req.body.employeeId = employeeId;

    const bankAccount = await EmployeeBankAccount.create(req.body);

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Create',
        module: 'Employee Management',
        entityType: 'EmployeeBankAccount',
        entityId: bankAccount._id,
        details: `Created bank account for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    // Mask sensitive data
    const maskedAccount = maskBankAccountData(bankAccount);

    res.status(201).json({
      success: true,
      data: maskedAccount,
      message: 'Bank account created successfully',
    });
  } catch (error) {
    // Handle validation errors
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

// @desc    Update bank account
// @route   PUT /api/employees/:employeeId/bank-accounts/:id
// @access  Private (HR Admin, Tenant Admin, Employee - own account)
exports.updateBankAccount = async (req, res) => {
  try {
    const { employeeId, id } = req.params;
    
    // Security: Employee can only update their own bank accounts
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
          message: 'Access denied. You can only manage your own bank accounts.',
        });
      }
    }

    const bankAccount = await EmployeeBankAccount.findOneAndUpdate(
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

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found',
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
        entityType: 'EmployeeBankAccount',
        entityId: bankAccount._id,
        details: `Updated bank account for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    // Mask sensitive data
    const maskedAccount = maskBankAccountData(bankAccount);

    res.status(200).json({
      success: true,
      data: maskedAccount,
      message: 'Bank account updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete bank account
// @route   DELETE /api/employees/:employeeId/bank-accounts/:id
// @access  Private (HR Admin, Tenant Admin, Employee - own account)
exports.deleteBankAccount = async (req, res) => {
  try {
    const { employeeId, id } = req.params;
    
    // Security: Employee can only delete their own bank accounts
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
          message: 'Access denied. You can only manage your own bank accounts.',
        });
      }
    }

    const bankAccount = await EmployeeBankAccount.findOne({
      _id: id,
      tenantId: req.tenantId,
      employeeId: employeeId,
    });

    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found',
      });
    }

    await bankAccount.deleteOne();

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Delete',
        module: 'Employee Management',
        entityType: 'EmployeeBankAccount',
        entityId: bankAccount._id,
        details: `Deleted bank account for employee: ${employeeId}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(200).json({
      success: true,
      message: 'Bank account deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
