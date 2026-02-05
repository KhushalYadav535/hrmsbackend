const Department = require('../models/Department');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
exports.getDepartments = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status) filter.status = status;

    const departments = await Department.find(filter).sort({ name: 1 });

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
    });

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
    if (req.body.parentDepartment === '') {
      delete req.body.parentDepartment;
    }

    // Validate required fields
    const { name, head, costCenter } = req.body;
    if (!name || !head || !costCenter) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, head, and costCenter',
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

    department = await Department.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

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
