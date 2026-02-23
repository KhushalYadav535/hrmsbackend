const OrganizationUnit = require('../models/OrganizationUnit');
const Employee = require('../models/Employee');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const AuditLog = require('../models/AuditLog');

/**
 * @desc    Get full organization hierarchy tree
 * @route   GET /api/org/hierarchy
 * @access  Private
 */
exports.getHierarchy = asyncHandler(async (req, res) => {
  const tree = await OrganizationUnit.getHierarchyTree(req.tenantId);
  
  res.status(200).json({
    success: true,
    count: tree.length,
    data: tree,
  });
});

/**
 * @desc    Get all organization units (with optional filtering)
 * @route   GET /api/org/units?type=ZO&isActive=true
 * @access  Private
 */
exports.getOrganizationUnits = asyncHandler(async (req, res) => {
  const { type, isActive, parentUnitId, city, state } = req.query;
  
  const filter = { tenantId: req.tenantId };
  
  if (type) {
    filter.unitType = type.toUpperCase();
  }
  
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }
  
  if (parentUnitId) {
    filter.parentUnitId = parentUnitId;
  }
  
  if (city) {
    filter.city = new RegExp(city, 'i');
  }
  
  if (state) {
    filter.state = new RegExp(state, 'i');
  }
  
  const units = await OrganizationUnit.find(filter)
    .populate('parentUnitId', 'unitCode unitName unitType')
    .populate('unitHeadId', 'firstName lastName employeeCode email')
    .sort({ unitType: 1, unitCode: 1 });
  
  res.status(200).json({
    success: true,
    count: units.length,
    data: units,
  });
});

/**
 * @desc    Get single organization unit
 * @route   GET /api/org/units/:id
 * @access  Private
 */
exports.getOrganizationUnit = asyncHandler(async (req, res) => {
  const unit = await OrganizationUnit.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('parentUnitId', 'unitCode unitName unitType state city')
    .populate('unitHeadId', 'firstName lastName employeeCode email phone designation')
    .populate({
      path: 'parentUnitId',
      populate: {
        path: 'parentUnitId',
        select: 'unitCode unitName unitType',
      },
    });
  
  if (!unit) {
    return res.status(404).json({
      success: false,
      message: 'Organization unit not found',
    });
  }
  
  res.status(200).json({
    success: true,
    data: unit,
  });
});

/**
 * @desc    Get child units of an organization unit
 * @route   GET /api/org/units/:id/children
 * @access  Private
 */
exports.getChildren = asyncHandler(async (req, res) => {
  const unit = await OrganizationUnit.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  
  if (!unit) {
    return res.status(404).json({
      success: false,
      message: 'Organization unit not found',
    });
  }
  
  const children = await unit.getChildren();
  
  // Populate unit head for each child
  await OrganizationUnit.populate(children, {
    path: 'unitHeadId',
    select: 'firstName lastName employeeCode email',
  });
  
  res.status(200).json({
    success: true,
    count: children.length,
    data: children,
  });
});

/**
 * @desc    Get all employees in an organization unit
 * @route   GET /api/org/units/:id/employees
 * @access  Private
 */
exports.getUnitEmployees = asyncHandler(async (req, res) => {
  const unit = await OrganizationUnit.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  
  if (!unit) {
    return res.status(404).json({
      success: false,
      message: 'Organization unit not found',
    });
  }
  
  // Get employees directly posted to this unit
  const directEmployees = await Employee.find({
    tenantId: req.tenantId,
    postingUnitId: req.params.id,
    status: { $ne: 'Retired' }, // Exclude retired employees
  })
    .select('firstName lastName employeeCode email phone designation department status joinDate')
    .populate('reportingManager', 'firstName lastName employeeCode')
    .sort({ employeeCode: 1 });
  
  // Get all descendant units (for hierarchical employee count)
  const descendantUnits = await unit.getDescendants();
  const descendantUnitIds = descendantUnits.map(u => u._id);
  
  // Get employees in descendant units
  const descendantEmployees = await Employee.find({
    tenantId: req.tenantId,
    postingUnitId: { $in: descendantUnitIds },
    status: { $ne: 'Retired' },
  })
    .select('firstName lastName employeeCode email phone designation department status joinDate')
    .populate('reportingManager', 'firstName lastName employeeCode')
    .populate('postingUnitId', 'unitCode unitName unitType')
    .sort({ employeeCode: 1 });
  
  res.status(200).json({
    success: true,
    data: {
      unit: {
        _id: unit._id,
        unitCode: unit.unitCode,
        unitName: unit.unitName,
        unitType: unit.unitType,
      },
      directEmployees: {
        count: directEmployees.length,
        employees: directEmployees,
      },
      totalEmployees: {
        count: directEmployees.length + descendantEmployees.length,
        breakdown: {
          direct: directEmployees.length,
          descendants: descendantEmployees.length,
        },
      },
      descendantEmployees: descendantEmployees,
    },
  });
});

/**
 * @desc    Create new organization unit
 * @route   POST /api/org/units
 * @access  Private (Tenant Admin only)
 */
exports.createOrganizationUnit = asyncHandler(async (req, res) => {
  const {
    unitCode,
    unitName,
    unitType,
    parentUnitId,
    unitHeadId,
    state,
    city,
    address,
    pinCode,
    isActive,
  } = req.body;
  
  // Validate required fields
  if (!unitCode || !unitName || !unitType) {
    return res.status(400).json({
      success: false,
      message: 'Please provide unitCode, unitName, and unitType',
    });
  }
  
  // Check for duplicate unitCode
  const existingUnit = await OrganizationUnit.findOne({
    tenantId: req.tenantId,
    unitCode: unitCode.toUpperCase().trim(),
  });
  
  if (existingUnit) {
    return res.status(400).json({
      success: false,
      message: `Organization unit with code "${unitCode}" already exists`,
    });
  }
  
  // Validate parent unit exists (if provided)
  if (parentUnitId) {
    const parentUnit = await OrganizationUnit.findOne({
      _id: parentUnitId,
      tenantId: req.tenantId,
    });
    
    if (!parentUnit) {
      return res.status(400).json({
        success: false,
        message: 'Parent unit not found',
      });
    }
    
    // Validate hierarchy
    const validHierarchy = {
      'ZO': ['HO'],
      'RO': ['ZO'],
      'BRANCH': ['RO'],
    };
    
    if (validHierarchy[unitType] && !validHierarchy[unitType].includes(parentUnit.unitType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid hierarchy: ${unitType} cannot be under ${parentUnit.unitType}`,
      });
    }
  }
  
  // Validate unitHeadId exists (if provided)
  if (unitHeadId) {
    const unitHead = await Employee.findOne({
      _id: unitHeadId,
      tenantId: req.tenantId,
    });
    
    if (!unitHead) {
      return res.status(400).json({
        success: false,
        message: 'Unit head (employee) not found',
      });
    }
  }
  
  // Create organization unit
  const unit = await OrganizationUnit.create({
    tenantId: req.tenantId,
    unitCode: unitCode.toUpperCase().trim(),
    unitName: unitName.trim(),
    unitType: unitType.toUpperCase(),
    parentUnitId: parentUnitId || null,
    unitHeadId: unitHeadId || null,
    state: state?.trim() || null,
    city: city?.trim() || null,
    address: address?.trim() || null,
    pinCode: pinCode?.trim() || null,
    isActive: isActive !== undefined ? isActive : true,
  });
  
  // Populate references
  await unit.populate('parentUnitId', 'unitCode unitName unitType');
  await unit.populate('unitHeadId', 'firstName lastName employeeCode email');
  
  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userRole: req.user.role,
    action: 'CREATE',
    entityType: 'OrganizationUnit',
    entityId: unit._id,
    description: `Created organization unit: ${unit.unitCode} - ${unit.unitName}`,
    metadata: {
      unitCode: unit.unitCode,
      unitType: unit.unitType,
    },
  });
  
  res.status(201).json({
    success: true,
    message: 'Organization unit created successfully',
    data: unit,
  });
});

/**
 * @desc    Update organization unit
 * @route   PATCH /api/org/units/:id
 * @access  Private (Tenant Admin only)
 */
exports.updateOrganizationUnit = asyncHandler(async (req, res) => {
  const unit = await OrganizationUnit.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  
  if (!unit) {
    return res.status(404).json({
      success: false,
      message: 'Organization unit not found',
    });
  }
  
  const {
    unitCode,
    unitName,
    unitType,
    parentUnitId,
    unitHeadId,
    state,
    city,
    address,
    pinCode,
    isActive,
  } = req.body;
  
  // Check for duplicate unitCode (if changed)
  if (unitCode && unitCode.toUpperCase().trim() !== unit.unitCode) {
    const existingUnit = await OrganizationUnit.findOne({
      tenantId: req.tenantId,
      unitCode: unitCode.toUpperCase().trim(),
      _id: { $ne: req.params.id },
    });
    
    if (existingUnit) {
      return res.status(400).json({
        success: false,
        message: `Organization unit with code "${unitCode}" already exists`,
      });
    }
  }
  
  // Validate parent unit (if changed)
  if (parentUnitId !== undefined && parentUnitId !== unit.parentUnitId?.toString()) {
    if (parentUnitId) {
      const parentUnit = await OrganizationUnit.findOne({
        _id: parentUnitId,
        tenantId: req.tenantId,
      });
      
      if (!parentUnit) {
        return res.status(400).json({
          success: false,
          message: 'Parent unit not found',
        });
      }
      
      // Prevent circular reference
      if (parentUnitId === req.params.id) {
        return res.status(400).json({
          success: false,
          message: 'Unit cannot be its own parent',
        });
      }
      
      // Validate hierarchy
      const finalUnitType = unitType || unit.unitType;
      const validHierarchy = {
        'ZO': ['HO'],
        'RO': ['ZO'],
        'BRANCH': ['RO'],
      };
      
      if (validHierarchy[finalUnitType] && !validHierarchy[finalUnitType].includes(parentUnit.unitType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid hierarchy: ${finalUnitType} cannot be under ${parentUnit.unitType}`,
        });
      }
    }
  }
  
  // Validate unitHeadId (if changed)
  if (unitHeadId !== undefined && unitHeadId !== unit.unitHeadId?.toString()) {
    if (unitHeadId) {
      const unitHead = await Employee.findOne({
        _id: unitHeadId,
        tenantId: req.tenantId,
      });
      
      if (!unitHead) {
        return res.status(400).json({
          success: false,
          message: 'Unit head (employee) not found',
        });
      }
    }
  }
  
  // Update fields
  if (unitCode) unit.unitCode = unitCode.toUpperCase().trim();
  if (unitName) unit.unitName = unitName.trim();
  if (unitType) unit.unitType = unitType.toUpperCase();
  if (parentUnitId !== undefined) unit.parentUnitId = parentUnitId || null;
  if (unitHeadId !== undefined) unit.unitHeadId = unitHeadId || null;
  if (state !== undefined) unit.state = state?.trim() || null;
  if (city !== undefined) unit.city = city?.trim() || null;
  if (address !== undefined) unit.address = address?.trim() || null;
  if (pinCode !== undefined) unit.pinCode = pinCode?.trim() || null;
  if (isActive !== undefined) unit.isActive = isActive;
  
  await unit.save();
  
  // Populate references
  await unit.populate('parentUnitId', 'unitCode unitName unitType');
  await unit.populate('unitHeadId', 'firstName lastName employeeCode email');
  
  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userRole: req.user.role,
    action: 'UPDATE',
    entityType: 'OrganizationUnit',
    entityId: unit._id,
    description: `Updated organization unit: ${unit.unitCode} - ${unit.unitName}`,
    metadata: {
      unitCode: unit.unitCode,
      unitType: unit.unitType,
      changes: req.body,
    },
  });
  
  res.status(200).json({
    success: true,
    message: 'Organization unit updated successfully',
    data: unit,
  });
});

/**
 * @desc    Delete organization unit
 * @route   DELETE /api/org/units/:id
 * @access  Private (Tenant Admin only)
 */
exports.deleteOrganizationUnit = asyncHandler(async (req, res) => {
  const unit = await OrganizationUnit.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  
  if (!unit) {
    return res.status(404).json({
      success: false,
      message: 'Organization unit not found',
    });
  }
  
  // Check if unit has children
  const children = await unit.getChildren();
  if (children.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete unit with ${children.length} child unit(s). Please delete or reassign children first.`,
    });
  }
  
  // Check if unit has employees
  const employeeCount = await Employee.countDocuments({
    tenantId: req.tenantId,
    postingUnitId: req.params.id,
  });
  
  if (employeeCount > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete unit with ${employeeCount} employee(s). Please reassign employees first.`,
    });
  }
  
  // Delete unit
  await OrganizationUnit.deleteOne({ _id: req.params.id });
  
  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userRole: req.user.role,
    action: 'DELETE',
    entityType: 'OrganizationUnit',
    entityId: req.params.id,
    description: `Deleted organization unit: ${unit.unitCode} - ${unit.unitName}`,
    metadata: {
      unitCode: unit.unitCode,
      unitType: unit.unitType,
    },
  });
  
  res.status(200).json({
    success: true,
    message: 'Organization unit deleted successfully',
  });
});
