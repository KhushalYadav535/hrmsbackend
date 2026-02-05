const Designation = require('../models/Designation');
const Employee = require('../models/Employee');

// @desc    Get all designations
// @route   GET /api/designations
// @access  Private
exports.getDesignations = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status) filter.status = status;

    const designations = await Designation.find(filter).sort({ level: -1, name: 1 });

    // Get employee count for each designation
    const designationsWithCounts = await Promise.all(
      designations.map(async (desig) => {
        const employeeCount = await Employee.countDocuments({
          tenantId: req.tenantId,
          designation: desig.name,
          status: { $ne: 'Retired' },
        });

        const desigObj = desig.toObject();
        desigObj.employees = employeeCount;
        desigObj.salaryBand = desig.minSalary > 0 && desig.maxSalary > 0
          ? `₹${desig.minSalary.toLocaleString('en-IN')} - ₹${desig.maxSalary.toLocaleString('en-IN')}`
          : 'Not specified';

        return desigObj;
      })
    );

    res.status(200).json({
      success: true,
      count: designationsWithCounts.length,
      data: designationsWithCounts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single designation
// @route   GET /api/designations/:id
// @access  Private
exports.getDesignation = async (req, res) => {
  try {
    const designation = await Designation.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!designation) {
      return res.status(404).json({
        success: false,
        message: 'Designation not found',
      });
    }

    // Get employee count
    const employeeCount = await Employee.countDocuments({
      tenantId: req.tenantId,
      designation: designation.name,
      status: { $ne: 'Retired' },
    });

    const desigObj = designation.toObject();
    desigObj.employees = employeeCount;

    res.status(200).json({
      success: true,
      data: desigObj,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create designation
// @route   POST /api/designations
// @access  Private (HR Admin, Tenant Admin)
exports.createDesignation = async (req, res) => {
  try {
    const { name, grade, level, minSalary, maxSalary, description, status } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Designation name is required',
      });
    }

    // Check if designation already exists for this tenant
    const existingDesignation = await Designation.findOne({
      tenantId: req.tenantId,
      name: name.trim(),
    });

    if (existingDesignation) {
      return res.status(400).json({
        success: false,
        message: 'Designation with this name already exists',
      });
    }

    const designation = await Designation.create({
      tenantId: req.tenantId,
      name: name.trim(),
      grade: grade?.trim() || '',
      level: level || 1,
      minSalary: minSalary || 0,
      maxSalary: maxSalary || 0,
      description: description?.trim() || '',
      status: status || 'Active',
    });

    res.status(201).json({
      success: true,
      data: designation,
      message: 'Designation created successfully',
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Designation with this name already exists',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update designation
// @route   PUT /api/designations/:id
// @access  Private (HR Admin, Tenant Admin)
exports.updateDesignation = async (req, res) => {
  try {
    const { name, grade, level, minSalary, maxSalary, description, status } = req.body;

    const designation = await Designation.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!designation) {
      return res.status(404).json({
        success: false,
        message: 'Designation not found',
      });
    }

    // If name is being changed, check for duplicates
    if (name && name.trim() !== designation.name) {
      const existingDesignation = await Designation.findOne({
        tenantId: req.tenantId,
        name: name.trim(),
        _id: { $ne: req.params.id },
      });

      if (existingDesignation) {
        return res.status(400).json({
          success: false,
          message: 'Designation with this name already exists',
        });
      }
    }

    if (name) designation.name = name.trim();
    if (grade !== undefined) designation.grade = grade?.trim() || '';
    if (level !== undefined) designation.level = level;
    if (minSalary !== undefined) designation.minSalary = minSalary;
    if (maxSalary !== undefined) designation.maxSalary = maxSalary;
    if (description !== undefined) designation.description = description?.trim() || '';
    if (status) designation.status = status;

    await designation.save();

    res.status(200).json({
      success: true,
      data: designation,
      message: 'Designation updated successfully',
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Designation with this name already exists',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete designation
// @route   DELETE /api/designations/:id
// @access  Private (HR Admin, Tenant Admin)
exports.deleteDesignation = async (req, res) => {
  try {
    const designation = await Designation.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!designation) {
      return res.status(404).json({
        success: false,
        message: 'Designation not found',
      });
    }

    // Check if any employees are using this designation
    const employeeCount = await Employee.countDocuments({
      tenantId: req.tenantId,
      designation: designation.name,
    });

    if (employeeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete designation. ${employeeCount} employee(s) are currently using this designation.`,
      });
    }

    await Designation.findByIdAndDelete(designation._id);

    res.status(200).json({
      success: true,
      message: 'Designation deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
