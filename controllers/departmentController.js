const Department = require('../models/Department');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
exports.getDepartments = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status) filter.status = status;

    const departments = await Department.find(filter)
      .populate('head', 'firstName lastName employeeCode designation')
      .populate('parentDepartment', 'name code')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: departments.length,
      data: departments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single department
// @route   GET /api/departments/:id
// @access  Private
exports.getDepartment = async (req, res) => {
  try {
    const department = await Department.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    })
      .populate('head', 'firstName lastName employeeCode designation')
      .populate('parentDepartment', 'name code')
      .populate('headHistory.employeeId', 'firstName lastName employeeCode');

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    res.status(200).json({
      success: true,
      data: department,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create department
// @route   POST /api/departments
// @access  Private (HR Admin, Tenant Admin, System Admin)
// Spec C2: Department Head REMOVED from Create form (BR-C2-01)
exports.createDepartment = async (req, res) => {
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

    // Clean up empty strings for optional fields
    if (req.body.parentDepartment === '' || req.body.parentDepartment === undefined) {
      delete req.body.parentDepartment;
    }
    if (req.body.head === '' || req.body.head === undefined) {
      delete req.body.head;
    }
    if (req.body.costCenter === '') {
      delete req.body.costCenter;
    }

    // Spec C2: Only name is required for creation. Head and costCenter are optional.
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide department name',
      });
    }

    // Validate name length (min 2, max 100 chars)
    if (name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Department name must be between 2 and 100 characters',
      });
    }

    // Check for duplicate department name within tenant
    const existingDepartment = await Department.findOne({
      tenantId: req.tenantId,
      name: name.trim(),
    });

    if (existingDepartment) {
      return res.status(400).json({
        success: false,
        message: `Department with name "${name}" already exists`,
      });
    }

    const department = await Department.create(req.body);

    res.status(201).json({
      success: true,
      data: department,
    });
  } catch (error) {
    console.error('Error creating department:', error);
    
    // Handle duplicate key error (unique constraint violation)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Department with this name already exists for this tenant',
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

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private (HR Admin, Tenant Admin, System Admin)
// Spec C2: Department Head can be assigned/changed via Edit form
exports.updateDepartment = async (req, res) => {
  try {
    let department = await Department.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    // BR-C2-04: Validate that head is not already head of another department
    if (req.body.head && req.body.head !== '' && req.body.head !== null) {
      const existingHead = await Department.findOne({
        tenantId: req.tenantId,
        head: req.body.head,
        _id: { $ne: req.params.id },
      });

      if (existingHead) {
        return res.status(400).json({
          success: false,
          message: 'This employee is already Department Head of another department',
        });
      }

      // BR-C2-03: Only Active employees can be assigned as head
      const employee = await Employee.findOne({
        _id: req.body.head,
        status: 'Active',
      });

      if (!employee) {
        return res.status(400).json({
          success: false,
          message: 'Selected employee is not active or not found',
        });
      }

      // BR-C2-05: Record head assignment with effective date
      const effectiveDate = req.body.headEffectiveDate || new Date();
      const previousHead = department.head;

      // Record removal of previous head
      if (previousHead && previousHead.toString() !== req.body.head) {
        department.headHistory.push({
          employeeId: previousHead,
          effectiveDate,
          action: 'removed',
          changedBy: req.user?._id,
        });
      }

      // Record assignment of new head
      department.headHistory.push({
        employeeId: req.body.head,
        effectiveDate,
        action: 'assigned',
        changedBy: req.user?._id,
      });
    }

    // BR-C2-06: Handle head removal (clearing the field)
    if (req.body.head === null || req.body.head === '') {
      if (department.head) {
        department.headHistory.push({
          employeeId: department.head,
          effectiveDate: req.body.headEffectiveDate || new Date(),
          action: 'removed',
          changedBy: req.user?._id,
        });
      }
      req.body.head = null;
    }

    // Remove headEffectiveDate from body before update (not a schema field on top level)
    delete req.body.headEffectiveDate;

    // Update department
    Object.assign(department, req.body);
    await department.save();

    // Populate for response
    await department.populate('head', 'firstName lastName employeeCode designation');
    await department.populate('parentDepartment', 'name code');

    res.status(200).json({
      success: true,
      data: department,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private (HR Admin, Tenant Admin, System Admin)
exports.deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    await department.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Department deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
