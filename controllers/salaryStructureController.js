const asyncHandler = require('express-async-handler');
const SalaryStructure = require('../models/SalaryStructure');

// @desc    Get all salary structures
// @route   GET /api/salary-structures
// @access  Private (HR Administrator, Payroll Administrator, Tenant Admin, Super Admin)
exports.getSalaryStructures = asyncHandler(async (req, res) => {
  const { status } = req.query;
  
  const query = {
    tenantId: req.tenantId,
  };
  
  if (status) {
    query.status = status;
  }

  const structures = await SalaryStructure.find(query)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email');

  res.status(200).json({
    success: true,
    count: structures.length,
    data: structures,
  });
});

// @desc    Get single salary structure
// @route   GET /api/salary-structures/:id
// @access  Private (HR Administrator, Payroll Administrator, Tenant Admin, Super Admin)
exports.getSalaryStructure = asyncHandler(async (req, res) => {
  const structure = await SalaryStructure.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email');

  if (!structure) {
    return res.status(404).json({
      success: false,
      message: 'Salary structure not found',
    });
  }

  res.status(200).json({
    success: true,
    data: structure,
  });
});

// @desc    Create salary structure
// @route   POST /api/salary-structures
// @access  Private (HR Administrator, Payroll Administrator, Tenant Admin, Super Admin)
exports.createSalaryStructure = asyncHandler(async (req, res) => {
  const {
    name,
    grade,
    location,
    version,
    effectiveFrom,
    effectiveTo,
    status,
    components,
    baseSalary,
  } = req.body;

  // Validation
  if (!name || !components || components.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Name and at least one component are required',
    });
  }

  // Check if structure with same name exists for tenant
  const existingStructure = await SalaryStructure.findOne({
    tenantId: req.tenantId,
    name: name.trim(),
  });

  if (existingStructure) {
    return res.status(400).json({
      success: false,
      message: 'Salary structure with this name already exists',
    });
  }

  // Validate components
  const hasBasic = components.some(c => 
    c.name.toLowerCase().includes('basic') && c.type === 'earning'
  );
  
  if (!hasBasic) {
    return res.status(400).json({
      success: false,
      message: 'Salary structure must have at least one Basic earning component',
    });
  }

  const structure = await SalaryStructure.create({
    tenantId: req.tenantId,
    name: name.trim(),
    grade: grade || '',
    location: location || '',
    version: version || '1.0',
    effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
    effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
    status: status || 'Active',
    components: components.map((c, idx) => ({
      name: c.name.trim(),
      type: c.type,
      calculationType: c.calculationType,
      base: c.base || (c.calculationType === 'percentage' ? 'Basic' : undefined),
      value: c.value || 0,
      isFixed: c.isFixed || false,
      applicable: c.applicable !== undefined ? c.applicable : true,
      order: c.order !== undefined ? c.order : idx,
    })),
    baseSalary: baseSalary || 0,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  res.status(201).json({
    success: true,
    message: 'Salary structure created successfully',
    data: structure,
  });
});

// @desc    Update salary structure
// @route   PUT /api/salary-structures/:id
// @access  Private (HR Administrator, Payroll Administrator, Tenant Admin, Super Admin)
exports.updateSalaryStructure = asyncHandler(async (req, res) => {
  const structure = await SalaryStructure.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!structure) {
    return res.status(404).json({
      success: false,
      message: 'Salary structure not found',
    });
  }

  const {
    name,
    grade,
    location,
    version,
    effectiveFrom,
    effectiveTo,
    status,
    components,
    baseSalary,
  } = req.body;

  // If name is being changed, check for duplicates
  if (name && name.trim() !== structure.name) {
    const existingStructure = await SalaryStructure.findOne({
      tenantId: req.tenantId,
      name: name.trim(),
      _id: { $ne: req.params.id },
    });

    if (existingStructure) {
      return res.status(400).json({
        success: false,
        message: 'Salary structure with this name already exists',
      });
    }
  }

  // Validate components if provided
  if (components && components.length > 0) {
    const hasBasic = components.some(c => 
      c.name.toLowerCase().includes('basic') && c.type === 'earning'
    );
    
    if (!hasBasic) {
      return res.status(400).json({
        success: false,
        message: 'Salary structure must have at least one Basic earning component',
      });
    }
  }

  // Update fields
  if (name) structure.name = name.trim();
  if (grade !== undefined) structure.grade = grade;
  if (location !== undefined) structure.location = location;
  if (version) structure.version = version;
  if (effectiveFrom) structure.effectiveFrom = new Date(effectiveFrom);
  if (effectiveTo !== undefined) structure.effectiveTo = effectiveTo ? new Date(effectiveTo) : null;
  if (status) structure.status = status;
  if (components) {
    structure.components = components.map((c, idx) => ({
      name: c.name.trim(),
      type: c.type,
      calculationType: c.calculationType,
      base: c.base || (c.calculationType === 'percentage' ? 'Basic' : undefined),
      value: c.value || 0,
      isFixed: c.isFixed || false,
      applicable: c.applicable !== undefined ? c.applicable : true,
      order: c.order !== undefined ? c.order : idx,
    }));
  }
  if (baseSalary !== undefined) structure.baseSalary = baseSalary;
  structure.updatedBy = req.user.id;

  await structure.save();

  res.status(200).json({
    success: true,
    message: 'Salary structure updated successfully',
    data: structure,
  });
});

// @desc    Delete salary structure
// @route   DELETE /api/salary-structures/:id
// @access  Private (HR Administrator, Payroll Administrator, Tenant Admin, Super Admin)
exports.deleteSalaryStructure = asyncHandler(async (req, res) => {
  const structure = await SalaryStructure.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!structure) {
    return res.status(404).json({
      success: false,
      message: 'Salary structure not found',
    });
  }

  // Check if structure is being used (you can add employee/payroll checks here)
  // For now, we'll allow deletion but mark as inactive instead
  if (structure.status === 'Active') {
    structure.status = 'Inactive';
    structure.updatedBy = req.user.id;
    await structure.save();
    
    return res.status(200).json({
      success: true,
      message: 'Salary structure deactivated successfully',
      data: structure,
    });
  }

  await structure.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Salary structure deleted successfully',
  });
});
