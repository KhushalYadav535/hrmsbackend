const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const Designation = require('../models/Designation');
const {
  userHasRole,
  userHasAnyRole,
  useNarrowEmployeeScope,
  ELEVATED_SCOPE_ROLES,
  ROLE_ENUM,
} = require('../utils/userRoles');
const AuditLog = require('../models/AuditLog');
const EmployeeBankAccount = require('../models/EmployeeBankAccount');
const EmployeeEmergencyContact = require('../models/EmployeeEmergencyContact');
const EmployeeNominee = require('../models/EmployeeNominee');
const EmployeePreviousEmployment = require('../models/EmployeePreviousEmployment');
const EmployeeFamilyDetail = require('../models/EmployeeFamilyDetail');
const { maskEmployeeData, maskBankAccountData, maskArray } = require('../utils/masking');

/** Designation is stored as ObjectId (or legacy string). Mixed schema has no ref — resolve names for API clients. */
function designationLookupKey(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw._id != null) {
    return raw._id.toString();
  }
  const s = String(raw);
  if (/^[a-fA-F0-9]{24}$/.test(s) && mongoose.Types.ObjectId.isValid(s)) {
    return s;
  }
  return null;
}

async function attachDesignationNames(employeePlainObjects, tenantId) {
  const list = Array.isArray(employeePlainObjects)
    ? employeePlainObjects
    : [employeePlainObjects];
  const idSet = new Set();
  for (const e of list) {
    const key = designationLookupKey(e.designation);
    if (key) idSet.add(key);
  }
  if (idSet.size === 0) return;
  const ids = [...idSet].map((id) => new mongoose.Types.ObjectId(id));
  const rows = await Designation.find({ tenantId, _id: { $in: ids } }).select('name').lean();
  const map = Object.fromEntries(rows.map((r) => [r._id.toString(), r]));
  for (const e of list) {
    const key = designationLookupKey(e.designation);
    if (key && map[key]) {
      e.designation = { _id: map[key]._id, name: map[key].name };
    }
  }
}

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
    const isAdmin = userHasAnyRole(req.user, adminRoles);

    if (isAdmin) {
      if (status && status !== 'all' && status !== '') {
        const statusMap = {
          'active': 'Active',
          'inactive': 'Inactive',
          'on leave': 'On Leave',
          'retired': 'Retired',
        };
        filter.status = statusMap[status.toLowerCase()] || status;
      }
      projection = null;
    } else if (useNarrowEmployeeScope(req.user)) {
      filter.status = 'Active';
      projection = 'firstName lastName department designation avatar email employeeCode';
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
    
    const plainEmployees = employees.map((emp) => emp.toObject());
    await attachDesignationNames(plainEmployees, req.tenantId);
    const maskedEmployees = plainEmployees.map((emp) => maskEmployeeData(emp));
    
    res.status(200).json({
      success: true,
      count: maskedEmployees.length,
      data: maskedEmployees,
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
    if (useNarrowEmployeeScope(req.user)) {
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

          const peerData = employee.toObject();
          await attachDesignationNames(peerData, req.tenantId);
          return res.status(200).json({ success: true, data: peerData });
       }
    }

    const employee = await Employee.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    })
      .populate('reportingManager', 'firstName lastName employeeCode')
      .populate('secondLevelManager', 'firstName lastName employeeCode')
      .populate('salaryStructure', 'name status');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Get related data
    const [bankAccounts, emergencyContacts, nominees, previousEmployments, familyDetails] = await Promise.all([
      EmployeeBankAccount.find({ tenantId: req.tenantId, employeeId: employee._id }).sort({ isPrimary: -1 }),
      EmployeeEmergencyContact.find({ tenantId: req.tenantId, employeeId: employee._id }),
      EmployeeNominee.find({ tenantId: req.tenantId, employeeId: employee._id }),
      EmployeePreviousEmployment.find({ tenantId: req.tenantId, employeeId: employee._id }).sort({ startDate: -1 }),
      EmployeeFamilyDetail.findOne({ tenantId: req.tenantId, employeeId: employee._id }),
    ]);

    // Convert employee to object and add related data
    const employeeData = employee.toObject();
    await attachDesignationNames(employeeData, req.tenantId);
    employeeData.bankAccounts = maskArray(bankAccounts, maskBankAccountData);
    employeeData.emergencyContacts = emergencyContacts;
    employeeData.nominees = nominees;
    employeeData.previousEmployments = previousEmployments;
    employeeData.familyDetails = familyDetails;

    // Mask sensitive employee data
    const maskedEmployee = maskEmployeeData(employeeData);

    res.status(200).json({
      success: true,
      data: maskedEmployee,
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

    if (cleanedData.bankAccount != null && cleanedData.bankAccount !== '') {
      cleanedData.bankAccount = String(cleanedData.bankAccount);
    }
    
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
    const designationStr = typeof designation === 'string' ? designation.trim() : String(designation || '');

    const ensureUsername = async () => {
      const nameParts = userName.split(/\s+/).filter(Boolean);
      const first = (nameParts[0] || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
      const rest = nameParts.slice(1).join('').toLowerCase().replace(/[^a-z0-9]/g, '');
      let generatedUsername = `${first}.${rest || 'employee'}`;
      let counter = 1;
      while (await User.findOne({ tenantId: req.tenantId, username: generatedUsername })) {
        generatedUsername = `${first}.${rest || 'employee'}${counter}`;
        counter++;
      }
      return generatedUsername;
    };

    try {
      // Check if user already exists
      const existingUser = await User.findOne({
        email: email.trim().toLowerCase(),
        tenantId: req.tenantId,
      });

      if (existingUser) {
        existingUser.name = userName;
        existingUser.password = password;
        // Do not downgrade Tenant Admin / Finance / HR / etc. when linking an employee record
        const hadElevatedRole = userHasAnyRole(existingUser, ELEVATED_SCOPE_ROLES);
        if (!hadElevatedRole) {
          existingUser.role = 'Employee';
          existingUser.roles = ['Employee'];
        } else {
          const base =
            Array.isArray(existingUser.roles) && existingUser.roles.length > 0
              ? [...existingUser.roles]
              : existingUser.role && ROLE_ENUM.includes(existingUser.role)
                ? [existingUser.role]
                : [];
          const merged = [...new Set([...base, 'Employee'])].filter((r) => ROLE_ENUM.includes(r));
          if (merged.length) {
            existingUser.roles = merged;
          }
        }
        existingUser.designation = designationStr;
        existingUser.department = department.trim();
        existingUser.status = 'Active';
        existingUser.adminProvisioned = true;
        existingUser.employeeId = employee._id;
        if (!existingUser.username) {
          existingUser.username = await ensureUsername();
        }
        existingUser.markModified('password');
        await existingUser.save();
      } else {
        const generatedUsername = await ensureUsername();
        const newUser = new User({
          email: email.trim().toLowerCase(),
          password,
          name: userName,
          username: generatedUsername,
          tenantId: req.tenantId,
          role: 'Employee',
          designation: designationStr,
          department: department.trim(),
          status: 'Active',
          adminProvisioned: true,
          employeeId: employee._id,
          joinDate: joinDate,
        });
        await newUser.save();
      }
    } catch (userError) {
      console.error('Error creating user account:', userError);
      try {
        await Employee.findByIdAndDelete(employee._id);
      } catch (rollbackErr) {
        console.error('Rollback employee after user failure:', rollbackErr);
      }
      return res.status(400).json({
        success: false,
        message: userError.message || 'Could not create login account. Check password (min 6 characters) and try again.',
      });
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

    const createdPlain = employee.toObject();
    await attachDesignationNames(createdPlain, req.tenantId);
    const maskedEmployee = maskEmployeeData(createdPlain);

    res.status(201).json({
      success: true,
      data: maskedEmployee,
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

    const updatedPlain = employee.toObject();
    await attachDesignationNames(updatedPlain, req.tenantId);
    const maskedEmployee = maskEmployeeData(updatedPlain);

    res.status(200).json({
      success: true,
      data: maskedEmployee,
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
