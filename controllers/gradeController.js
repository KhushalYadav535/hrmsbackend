const Grade = require('../models/Grade');

// @desc    Get all grades for tenant
// @route   GET /api/grades
// @access  Private
exports.getGrades = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status;

    const grades = await Grade.find(filter).sort({ level: 1, name: 1 });

    res.status(200).json({
      success: true,
      count: grades.length,
      data: grades,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get active grades for dropdown
// @route   GET /api/grades/active
// @access  Private
exports.getActiveGrades = async (req, res) => {
  try {
    const grades = await Grade.find({
      tenantId: req.tenantId,
      status: 'Active',
    }).sort({ level: 1, name: 1 }).select('name level payrollBand');

    res.status(200).json({
      success: true,
      count: grades.length,
      data: grades,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single grade
// @route   GET /api/grades/:id
// @access  Private
exports.getGrade = async (req, res) => {
  try {
    const grade = await Grade.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!grade) {
      return res.status(404).json({
        success: false,
        message: 'Grade not found',
      });
    }

    res.status(200).json({
      success: true,
      data: grade,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create grade
// @route   POST /api/grades
// @access  Private (HR Admin, Tenant Admin)
exports.createGrade = async (req, res) => {
  try {
    req.body.tenantId = req.tenantId;

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide grade name',
      });
    }

    const existing = await Grade.findOne({
      tenantId: req.tenantId,
      name: name.trim(),
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Grade "${name}" already exists`,
      });
    }

    const grade = await Grade.create(req.body);

    res.status(201).json({
      success: true,
      data: grade,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Grade with this name already exists for this tenant',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update grade
// @route   PUT /api/grades/:id
// @access  Private (HR Admin, Tenant Admin)
exports.updateGrade = async (req, res) => {
  try {
    let grade = await Grade.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!grade) {
      return res.status(404).json({
        success: false,
        message: 'Grade not found',
      });
    }

    grade = await Grade.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: grade,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete (archive) grade
// @route   DELETE /api/grades/:id
// @access  Private (HR Admin, Tenant Admin)
exports.deleteGrade = async (req, res) => {
  try {
    const grade = await Grade.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!grade) {
      return res.status(404).json({
        success: false,
        message: 'Grade not found',
      });
    }

    // BR-C1-16: Archive instead of hard delete
    grade.status = 'Archived';
    await grade.save();

    res.status(200).json({
      success: true,
      message: 'Grade archived successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
