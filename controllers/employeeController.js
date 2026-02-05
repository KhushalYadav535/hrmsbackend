const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private
exports.getEmployees = async (req, res) => {
  try {
    const { search, status, department } = req.query;
    const filter = { tenantId: req.tenantId };

    // Security: Restrict Employee access
    let projection = null;
    const adminRoles = ['Super Admin', 'Tenant Admin', 'HR Administrator', 'Payroll Administrator', 'Finance Administrator', 'Manager', 'Auditor'];
    const isAdmin = adminRoles.includes(req.user.role);
    
    if (req.user.role === 'Employee') {
      // Employees can only see active employees and limited fields
      filter.status = 'Active'; // Use exact enum value
      projection = 'firstName lastName department designation avatar email employeeCode';
    } else if (isAdmin) {
      // Admin roles (HR, Tenant Admin, etc.) can see ALL employees regardless of status
      // Only apply status filter if explicitly provided in query
      if (status && status !== 'all' && status !== '') {
        // Map common status values to enum values
        const statusMap = {
          'active': 'Active',
          'inactive': 'Inactive',
          'on leave': 'On Leave',
          'retired': 'Retired',
        };
        filter.status = statusMap[status.toLowerCase()] || status;
      }
      // No projection - admins see all fields (including employeeCode)
      projection = null;
    }

    if (department && department !== 'all' && department !== '') filter.department = department;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    // Build query with or without projection
    let query = Employee.find(filter);
    if (projection) {
      query = query.select(projection);
    }
    
    const employees = await query
      .populate('reportingManager', 'firstName lastName employeeCode')
      .sort({ createdAt: -1 });

    // Log sample employee data to verify employeeCode is included
    if (employees.length > 0) {
      console.log(`[getEmployees] Role: ${req.user.role}, Tenant: ${req.tenantId}, Found: ${employees.length} employees`);
      console.log(`[getEmployees] Sample employee:`, {
        employeeCode: employees[0].employeeCode,
        name: `${employees[0].firstName} ${employees[0].lastName}`,
        hasEmployeeCode: !!employees[0].employeeCode
      });
    } else {
      console.log(`[getEmployees] Role: ${req.user.role}, Tenant: ${req.tenantId}, Filter:`, JSON.stringify(filter), `Found: 0 employees`);
    }
    
    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    console.error('[getEmployees] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Private
exports.getEmployee = async (req, res) => {
  try {
    // Security: Check if employee is accessing own profile or allowed to view others
    if (req.user.role === 'Employee') {
       // Get current employee ID
       const currentEmployee = await Employee.findOne({ email: req.user.email, tenantId: req.tenantId });
       
       // If accessing someone else's profile, restrict fields
       if (currentEmployee && currentEmployee._id.toString() !== req.params.id) {
          const employee = await Employee.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
          }).select('firstName lastName department designation avatar email'); // Public profile only

          if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
          }
          
          return res.status(200).json({ success: true, data: employee });
       }
    }

    const employee = await Employee.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('reportingManager', 'firstName lastName employeeCode');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    res.status(200).json({
      success: true,
      data: employee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create employee
// @route   POST /api/employees
// @access  Private (HR Admin, Tenant Admin)
exports.createEmployee = async (req, res) => {
  try {
    // Validate tenantId is present
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required',
      });
    }

    // Ensure tenantId is set
    req.body.tenantId = req.tenantId;

    // Validate required fields
    const { employeeCode, firstName, lastName, email, phone, dateOfBirth, gender, 
            designation, department, joinDate, location, salary, ctc } = req.body;
    
    if (!employeeCode || !firstName || !lastName || !email || !phone || 
        !dateOfBirth || !gender || !designation || !department || 
        !joinDate || !location || !salary || !ctc) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    // Check for duplicate employeeCode within tenant
    const existingEmployeeByCode = await Employee.findOne({
      tenantId: req.tenantId,
      employeeCode: employeeCode.trim(),
    });

    if (existingEmployeeByCode) {
      return res.status(400).json({
        success: false,
        message: `Employee with code "${employeeCode}" already exists`,
      });
    }

    // Check for duplicate email within tenant
    const existingEmployeeByEmail = await Employee.findOne({
      tenantId: req.tenantId,
      email: email.trim().toLowerCase(),
    });

    if (existingEmployeeByEmail) {
      return res.status(400).json({
        success: false,
        message: `Employee with email "${email}" already exists`,
      });
    }

    // Parse dates if they're strings
    if (req.body.dateOfBirth && typeof req.body.dateOfBirth === 'string') {
      req.body.dateOfBirth = new Date(req.body.dateOfBirth);
      if (isNaN(req.body.dateOfBirth.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dateOfBirth format',
        });
      }
    }
    
    if (req.body.joinDate && typeof req.body.joinDate === 'string') {
      req.body.joinDate = new Date(req.body.joinDate);
      if (isNaN(req.body.joinDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid joinDate format',
        });
      }
    }

    // Validate password if provided
    if (!req.body.password || req.body.password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password is required and must be at least 6 characters long',
      });
    }

    // Clean up empty strings for optional fields
    const cleanedData = { ...req.body };
    const password = cleanedData.password;
    delete cleanedData.password; // Remove password from employee data
    
    Object.keys(cleanedData).forEach(key => {
      if (cleanedData[key] === '' || cleanedData[key] === undefined) {
        delete cleanedData[key];
      }
    });

    // Create employee
    const employee = await Employee.create(cleanedData);

    // Create User account for employee login
    const User = require('../models/User');
    const userName = `${firstName} ${lastName}`.trim();
    
    try {
      // Check if user already exists
      const existingUser = await User.findOne({
        email: email.trim().toLowerCase(),
        tenantId: req.tenantId,
      });

      if (existingUser) {
        // If user exists, update it to link with employee
        existingUser.name = userName;
        existingUser.password = password; // Will be hashed by pre-save hook
        existingUser.role = 'Employee';
        existingUser.designation = designation.trim();
        existingUser.department = department.trim();
        existingUser.status = 'active';
        // Mark password as modified to trigger hashing
        existingUser.markModified('password');
        await existingUser.save();
      } else {
        // Create new user account
        const newUser = new User({
          email: email.trim().toLowerCase(),
          password: password, // Will be hashed by pre-save hook
          name: userName,
          tenantId: req.tenantId,
          role: 'Employee',
          designation: designation.trim(),
          department: department.trim(),
          status: 'active',
          joinDate: joinDate,
        });
        await newUser.save();
      }
    } catch (userError) {
      console.error('Error creating user account:', userError);
      // If user creation fails, we still return success for employee creation
      // but log the error
    }

    // Update tenant employee count
    const Tenant = require('../models/Tenant');
    await Tenant.findByIdAndUpdate(req.tenantId, { $inc: { employees: 1 } });

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Create',
        module: 'Employee Management',
        entityType: 'Employee',
        entityId: employee._id,
        details: `Created new employee: ${userName} (${employeeCode})`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
        changes: `New employee record added with email: ${email}`,
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(201).json({
      success: true,
      data: employee,
      message: 'Employee created successfully. User account has been created for login.',
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    
    // Handle duplicate key error (unique constraint violation)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return res.status(400).json({
        success: false,
        message: `Employee with this ${field} already exists`,
        error: error.message,
      });
    }

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

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private (HR Admin, Tenant Admin)
exports.updateEmployee = async (req, res) => {
  try {
    let employee = await Employee.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    const oldData = { ...employee.toObject() };
    employee = await Employee.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    // Create audit log
    try {
      const changes = Object.keys(req.body)
        .filter(key => oldData[key] !== employee[key])
        .map(key => `${key}: ${oldData[key]} → ${employee[key]}`)
        .join(', ');

      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Update',
        module: 'Employee Management',
        entityType: 'Employee',
        entityId: employee._id,
        details: `Updated employee: ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
        changes: changes || 'Employee record updated',
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(200).json({
      success: true,
      data: employee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private (HR Admin, Tenant Admin)
exports.deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    const employeeName = `${employee.firstName} ${employee.lastName}`;
    const employeeCode = employee.employeeCode;

    await employee.deleteOne();

    // Update tenant employee count
    const Tenant = require('../models/Tenant');
    await Tenant.findByIdAndUpdate(req.tenantId, { $inc: { employees: -1 } });

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Delete',
        module: 'Employee Management',
        entityType: 'Employee',
        entityId: employee._id,
        details: `Deleted employee: ${employeeName} (${employeeCode})`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
        changes: `Employee record removed`,
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(200).json({
      success: true,
      message: 'Employee deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
