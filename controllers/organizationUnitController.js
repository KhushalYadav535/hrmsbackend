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
exports.getOrganizationUnitChildren = asyncHandler(async (req, res) => {
  const children = await OrganizationUnit.find({
    tenantId: req.tenantId,
    parentUnitId: req.params.id,
  })
    .populate('unitHeadId', 'firstName lastName employeeCode')
    .sort({ unitType: 1, unitCode: 1 });
  
  res.status(200).json({
    success: true,
    count: children.length,
    data: children,
  });
});

/**
 * @desc    Create organization unit
 * @route   POST /api/org/units
 * @access  Private (Tenant Admin, HR Administrator)
 */
exports.createOrganizationUnit = asyncHandler(async (req, res) => {
  const {
    unitCode,
    unitName,
    unitType,
    parentUnitId,
    unitHeadId,
    branchCode,
    branchType,
    openingDate,
    headquartersCity,
    effectiveDate,
    address,
    city,
    state,
    pinCode,
    isActive,
  } = req.body;

  if (!unitCode || !unitName || !unitType) {
    return res.status(400).json({
      success: false,
      message: 'Unit Code, Unit Name, and Unit Type are required',
    });
  }

  // Normalize unit code
  const normalizedCode = unitCode.toUpperCase().trim();

  // Validate unit code format before attempting to create
  const codePatterns = {
    HO: /^HO-\d{3}$/,
    ZO: /^ZO-[A-Z]{3,6}-\d{2}$/,
    RO: /^RO-[A-Z0-9]{4,6}$/,
    BRANCH: /^BR-\d{6}$/,
    DEPARTMENT: /^DEPT-[A-Z0-9]{3,10}$/,
  };

  const unitTypeUpper = unitType.toUpperCase();
  if (!codePatterns[unitTypeUpper] || !codePatterns[unitTypeUpper].test(normalizedCode)) {
    const formatExamples = {
      HO: 'HO-001',
      ZO: 'ZO-SOUTH-01',
      RO: 'RO-DEL01',
      BRANCH: 'BR-000001',
      DEPARTMENT: 'DEPT-HR',
    };
    
    return res.status(400).json({
      success: false,
      message: `Invalid unit code format for ${unitType}. Received: "${unitCode}". Expected format: ${formatExamples[unitTypeUpper] || 'Check format'}`,
    });
  }

  // BR-ORG-01: HO has no parent; BRANCH may omit parent (e.g. HO-only banks: Head Office → Branches)
  const parentOptionalTypes = ['HO', 'BRANCH'];
  if (!parentOptionalTypes.includes(unitTypeUpper) && !parentUnitId) {
    return res.status(400).json({
      success: false,
      message: 'Parent unit is required for this unit type',
    });
  }

  // Check if unit code already exists
  const existing = await OrganizationUnit.findOne({
    tenantId: req.tenantId,
    unitCode: normalizedCode,
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: `Unit code ${normalizedCode} already exists`,
    });
  }

  const unit = await OrganizationUnit.create({
    tenantId: req.tenantId,
    unitCode: normalizedCode,
    unitName: unitName.trim(),
    unitType: unitTypeUpper,
    parentUnitId: parentUnitId || null,
    unitHeadId: unitHeadId || null,
    branchCode: branchCode ? branchCode.toUpperCase().trim() : undefined,
    branchType: branchType || undefined,
    openingDate: openingDate ? new Date(openingDate) : undefined,
    headquartersCity: headquartersCity || undefined,
    effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
    address: address || undefined,
    city: city || undefined,
    state: state || undefined,
    pinCode: pinCode || undefined,
    isActive: isActive !== undefined ? isActive : true,
  });

  await unit.populate('parentUnitId', 'unitCode unitName');
  await unit.populate('unitHeadId', 'firstName lastName');

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || 'System',
    userEmail: req.user.email,
    action: 'Create',
    module: 'Organization Structure',
    entityType: 'OrganizationUnit',
    entityId: unit._id,
    details: `Created ${unitType} unit: ${unitCode} - ${unitName}`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    message: 'Organization unit created successfully',
    data: unit,
  });
});

/**
 * @desc    Update organization unit
 * @route   PUT /api/org/units/:id
 * @access  Private (Tenant Admin, HR Administrator)
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

  // BR-ORG-09: Cannot change parent if unit has children
  if (req.body.parentUnitId && req.body.parentUnitId !== unit.parentUnitId?.toString()) {
    const children = await OrganizationUnit.countDocuments({
      tenantId: req.tenantId,
      parentUnitId: unit._id,
    });
    if (children > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot change parent unit. Unit has ${children} child unit(s).`,
      });
    }
  }

  // Update fields
  Object.keys(req.body).forEach((key) => {
    if (key === 'unitCode') {
      unit[key] = req.body[key].toUpperCase().trim();
    } else if (key === 'branchCode' && req.body[key]) {
      unit[key] = req.body[key].toUpperCase().trim();
    } else if (key === 'openingDate' && req.body[key]) {
      unit[key] = new Date(req.body[key]);
    } else if (key === 'effectiveDate' && req.body[key]) {
      unit[key] = new Date(req.body[key]);
    } else if (req.body[key] !== undefined) {
      unit[key] = req.body[key];
    }
  });

  await unit.save();
  await unit.populate('parentUnitId', 'unitCode unitName');
  await unit.populate('unitHeadId', 'firstName lastName');

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || 'System',
    userEmail: req.user.email,
    action: 'Update',
    module: 'Organization Structure',
    entityType: 'OrganizationUnit',
    entityId: unit._id,
    details: `Updated unit: ${unit.unitCode} - ${unit.unitName}`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status: 'Success',
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

  // BR-ORG-07: Cannot delete if has children
  const children = await OrganizationUnit.countDocuments({
    tenantId: req.tenantId,
    parentUnitId: unit._id,
  });

  if (children > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete unit with ${children} child unit(s). Please delete or reassign children first.`,
    });
  }

  // BR-ORG-08: Check if unit has employees
  const employees = await Employee.countDocuments({
    tenantId: req.tenantId,
    postingUnitId: unit._id,
    status: 'Active',
  });

  if (employees > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete unit with ${employees} active employee(s). Please reassign employees first or deactivate the unit.`,
    });
  }

  await unit.deleteOne();

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || 'System',
    userEmail: req.user.email,
    action: 'Delete',
    module: 'Organization Structure',
    entityType: 'OrganizationUnit',
    entityId: unit._id,
    details: `Deleted unit: ${unit.unitCode} - ${unit.unitName}`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'Organization unit deleted successfully',
  });
});

/**
 * @desc    Get employees in a unit (with hierarchy)
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

  // Get direct employees
  const directEmployees = await Employee.find({
    tenantId: req.tenantId,
    postingUnitId: req.params.id,
    status: 'Active',
  })
    .populate('designation', 'name')
    .populate('grade', 'name')
    .select('firstName lastName employeeCode email phone designation grade department');

  // Get child units
  const childUnits = await OrganizationUnit.find({
    tenantId: req.tenantId,
    parentUnitId: req.params.id,
  }).select('_id');

  const childUnitIds = childUnits.map((u) => u._id);

  // Get employees from child units (recursive)
  let childEmployees = [];
  if (childUnitIds.length > 0) {
    childEmployees = await Employee.find({
      tenantId: req.tenantId,
      postingUnitId: { $in: childUnitIds },
      status: 'Active',
    })
      .populate('designation', 'name')
      .populate('grade', 'name')
      .select('firstName lastName employeeCode email phone designation grade department postingUnitId');
  }

  res.status(200).json({
    success: true,
    data: {
      unit: {
        id: unit._id,
        code: unit.unitCode,
        name: unit.unitName,
        type: unit.unitType,
      },
      directEmployees: {
        count: directEmployees.length,
        employees: directEmployees,
      },
      childEmployees: {
        count: childEmployees.length,
        employees: childEmployees,
      },
      totalEmployees: {
        count: directEmployees.length + childEmployees.length,
      },
    },
  });
});

/**
 * @desc    Create seed/sample data for zones and regions
 * @route   POST /api/org/units/seed
 * @access  Private (Tenant Admin only)
 */
exports.seedSampleData = asyncHandler(async (req, res) => {
  // Check if HO exists
  let ho = await OrganizationUnit.findOne({
    tenantId: req.tenantId,
    unitType: 'HO',
  });

  if (!ho) {
    // Create Head Office
    ho = await OrganizationUnit.create({
      tenantId: req.tenantId,
      unitCode: 'HO-001',
      unitName: 'Head Office',
      unitType: 'HO',
      city: 'Mumbai',
      state: 'Maharashtra',
      address: 'Corporate Headquarters',
      pinCode: '400001',
      isActive: true,
    });
  }

  // Sample Zones
  const sampleZones = [
    {
      unitCode: 'ZO-NORTH-01',
      unitName: 'North Zone',
      unitType: 'ZO',
      parentUnitId: ho._id,
      headquartersCity: 'Delhi',
      city: 'Delhi',
      state: 'Delhi',
      address: 'North Zone Office',
      pinCode: '110001',
      effectiveDate: new Date('2020-01-01'),
      isActive: true,
    },
    {
      unitCode: 'ZO-SOUTH-01',
      unitName: 'South Zone',
      unitType: 'ZO',
      parentUnitId: ho._id,
      headquartersCity: 'Chennai',
      city: 'Chennai',
      state: 'Tamil Nadu',
      address: 'South Zone Office',
      pinCode: '600001',
      effectiveDate: new Date('2020-01-01'),
      isActive: true,
    },
    {
      unitCode: 'ZO-EAST-01',
      unitName: 'East Zone',
      unitType: 'ZO',
      parentUnitId: ho._id,
      headquartersCity: 'Kolkata',
      city: 'Kolkata',
      state: 'West Bengal',
      address: 'East Zone Office',
      pinCode: '700001',
      effectiveDate: new Date('2020-01-01'),
      isActive: true,
    },
    {
      unitCode: 'ZO-WEST-01',
      unitName: 'West Zone',
      unitType: 'ZO',
      parentUnitId: ho._id,
      headquartersCity: 'Mumbai',
      city: 'Mumbai',
      state: 'Maharashtra',
      address: 'West Zone Office',
      pinCode: '400001',
      effectiveDate: new Date('2020-01-01'),
      isActive: true,
    },
  ];

  const createdZones = [];
  for (const zoneData of sampleZones) {
    const existing = await OrganizationUnit.findOne({
      tenantId: req.tenantId,
      unitCode: zoneData.unitCode,
    });
    if (!existing) {
      const zone = await OrganizationUnit.create({
        ...zoneData,
        tenantId: req.tenantId,
      });
      createdZones.push(zone);
    } else {
      createdZones.push(existing);
    }
  }

  // Sample Regions under each Zone
  const sampleRegions = [
    // North Zone Regions
    {
      unitCode: 'RO-DELHI-01',
      unitName: 'Delhi Region',
      unitType: 'RO',
      parentUnitId: createdZones[0]._id,
      city: 'Delhi',
      state: 'Delhi',
      address: 'Delhi Regional Office',
      pinCode: '110001',
      effectiveDate: new Date('2020-02-01'),
      isActive: true,
    },
    {
      unitCode: 'RO-PUNJAB-01',
      unitName: 'Punjab Region',
      unitType: 'RO',
      parentUnitId: createdZones[0]._id,
      city: 'Chandigarh',
      state: 'Punjab',
      address: 'Punjab Regional Office',
      pinCode: '160001',
      effectiveDate: new Date('2020-02-01'),
      isActive: true,
    },
    // South Zone Regions
    {
      unitCode: 'RO-TN-01',
      unitName: 'Tamil Nadu Region',
      unitType: 'RO',
      parentUnitId: createdZones[1]._id,
      city: 'Chennai',
      state: 'Tamil Nadu',
      address: 'Tamil Nadu Regional Office',
      pinCode: '600001',
      effectiveDate: new Date('2020-02-01'),
      isActive: true,
    },
    {
      unitCode: 'RO-KERALA-01',
      unitName: 'Kerala Region',
      unitType: 'RO',
      parentUnitId: createdZones[1]._id,
      city: 'Kochi',
      state: 'Kerala',
      address: 'Kerala Regional Office',
      pinCode: '682001',
      effectiveDate: new Date('2020-02-01'),
      isActive: true,
    },
    // East Zone Regions
    {
      unitCode: 'RO-WB-01',
      unitName: 'West Bengal Region',
      unitType: 'RO',
      parentUnitId: createdZones[2]._id,
      city: 'Kolkata',
      state: 'West Bengal',
      address: 'West Bengal Regional Office',
      pinCode: '700001',
      effectiveDate: new Date('2020-02-01'),
      isActive: true,
    },
    // West Zone Regions
    {
      unitCode: 'RO-MH-01',
      unitName: 'Maharashtra Region',
      unitType: 'RO',
      parentUnitId: createdZones[3]._id,
      city: 'Mumbai',
      state: 'Maharashtra',
      address: 'Maharashtra Regional Office',
      pinCode: '400001',
      effectiveDate: new Date('2020-02-01'),
      isActive: true,
    },
    {
      unitCode: 'RO-GUJARAT-01',
      unitName: 'Gujarat Region',
      unitType: 'RO',
      parentUnitId: createdZones[3]._id,
      city: 'Ahmedabad',
      state: 'Gujarat',
      address: 'Gujarat Regional Office',
      pinCode: '380001',
      effectiveDate: new Date('2020-02-01'),
      isActive: true,
    },
  ];

  const createdRegions = [];
  for (const regionData of sampleRegions) {
    const existing = await OrganizationUnit.findOne({
      tenantId: req.tenantId,
      unitCode: regionData.unitCode,
    });
    if (!existing) {
      const region = await OrganizationUnit.create({
        ...regionData,
        tenantId: req.tenantId,
      });
      createdRegions.push(region);
    } else {
      createdRegions.push(existing);
    }
  }

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || 'System',
    userEmail: req.user.email,
    action: 'Create',
    module: 'Organization Structure',
    entityType: 'SeedData',
    details: `Created sample data: ${createdZones.length} zones, ${createdRegions.length} regions`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    message: `Sample data created: ${createdZones.length} zones, ${createdRegions.length} regions`,
    data: {
      zones: createdZones.length,
      regions: createdRegions.length,
      total: createdZones.length + createdRegions.length,
    },
  });
});

/**
 * @desc    Delete all seed/sample data (zones, regions, branches with seed patterns)
 * @route   DELETE /api/org/units/seed
 * @access  Private (Tenant Admin only)
 */
exports.deleteSeedData = asyncHandler(async (req, res) => {
  // Get all zones and regions for this tenant
  const allZones = await OrganizationUnit.find({
    tenantId: req.tenantId,
    unitType: { $in: ['ZO', 'RO'] },
  });

  const zonesToDelete = [];
  const regionsToDelete = [];
  
  for (const unit of allZones) {
    // Delete ALL zones (ZO) - tenant admin will create their own
    if (unit.unitType === 'ZO') {
      // Check for common seed zone patterns
      const isSeedZone = 
        unit.unitCode.match(/^ZO-(NORTH|SOUTH|EAST|WEST)(-01)?$/i) ||
        unit.unitName.match(/^(North|South|East|West)\s+Zone$/i);
      
      if (isSeedZone) {
        zonesToDelete.push(unit._id);
      }
    }
    
    // Delete ALL regions (RO) - tenant admin will create their own
    if (unit.unitType === 'RO') {
      // Pattern matching for regions: RO-XXX01, RO-XXX02, RO-XXX-01, etc.
      // Match ALL common seed patterns
      const matchesCodePattern = 
        /^RO-[A-Z]{3,6}\d{2}$/i.test(unit.unitCode) ||     // RO-BHU01, RO-BLR01, RO-DEL01, RO-MUM01, RO-KOL01, RO-HYD01, RO-CHD01, RO-CHY01, RO-PUN01
        /^RO-[A-Z]+-\d{2}$/i.test(unit.unitCode) ||       // RO-DELHI-01, RO-PUNJAB-01
        /^RO-[A-Z]{2,4}\d{1,2}$/i.test(unit.unitCode) ||  // RO-MUM1, RO-MUM01
        /^RO-[A-Z]{3,6}0\d{1}$/i.test(unit.unitCode) ||   // RO-CHY01, RO-CHIN02
        /^RO-[A-Z]{2,6}\d{2}$/i.test(unit.unitCode);      // Catch all: RO-XXX## pattern
      
      // Check for common seed region names (comprehensive)
      const hasSeedName = unit.unitName && (
        unit.unitName.match(/^(Bhubaneswar|Bangalore|Chandigarh|Chennai|Delhi|Hyderabad|Kolkata|Mumbai|Pune|Punjab|Tamil Nadu|Kerala|West Bengal|Maharashtra|Gujarat)\s+Regional\s+Office/i) ||
        unit.unitName.match(/Regional\s+Office\s+\d+$/i) ||
        unit.unitName.includes('Regional Office 1') ||
        unit.unitName.includes('Regional Office 2') ||
        unit.unitName.match(/^(Delhi|Mumbai|Chennai|Kolkata|Pune|Bangalore|Hyderabad|Bhubaneswar|Chandigarh)\s+Regional\s+Office/i) ||
        unit.unitName.match(/\s+Regional\s+Office\s*$/i) // Any "Regional Office" ending
      );
      
      // If matches any seed pattern, delete it
      if (matchesCodePattern || hasSeedName) {
        regionsToDelete.push(unit._id);
      }
    }
  }

  // Delete zones
  let deletedZones = 0;
  if (zonesToDelete.length > 0) {
    const result = await OrganizationUnit.deleteMany({
      tenantId: req.tenantId,
      _id: { $in: zonesToDelete },
    });
    deletedZones = result.deletedCount;
  }

  // Delete regions
  let deletedRegions = 0;
  if (regionsToDelete.length > 0) {
    const result = await OrganizationUnit.deleteMany({
      tenantId: req.tenantId,
      _id: { $in: regionsToDelete },
    });
    deletedRegions = result.deletedCount;
  }

  // Delete branches with seed patterns
  const seedBranchPatterns = [
    /^BR-0000\d{2}$/, // BR-000001 to BR-000099
    /^BR-000\d{3}$/,  // BR-000100 to BR-000999
    /^BR-00\d{4}$/,   // BR-000001 to BR-009999 (extended range)
  ];
  
  // Get all branches for this tenant
  const allBranches = await OrganizationUnit.find({
    tenantId: req.tenantId,
    unitType: 'BRANCH',
  });

  let deletedBranches = 0;
  const branchesToDelete = [];
  
  for (const branch of allBranches) {
    // Check if branch code matches seed pattern
    const matchesPattern = seedBranchPatterns.some(pattern => pattern.test(branch.unitCode));
    
    // Check if branch name contains common seed keywords
    const hasSeedName = branch.unitName && (
      branch.unitName.includes('Branch 1') ||
      branch.unitName.includes('Branch 2') ||
      branch.unitName.includes('Branch 3') ||
      branch.unitName.includes('Branch 4') ||
      branch.unitName.match(/^(Mumbai|Delhi|Pune|Chennai|Bangalore|Kolkata|Hyderabad|Bhubaneswar|Chandigarh)\s+Branch\s+\d+$/i) ||
      branch.unitName.match(/Branch\s+\d+$/i)
    );

    if (matchesPattern || hasSeedName) {
      branchesToDelete.push(branch._id);
    }
  }

  if (branchesToDelete.length > 0) {
    const result = await OrganizationUnit.deleteMany({
      tenantId: req.tenantId,
      _id: { $in: branchesToDelete },
    });
    deletedBranches = result.deletedCount;
  }

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || 'System',
    userEmail: req.user.email,
    action: 'Delete',
    module: 'Organization Structure',
    entityType: 'SeedData',
    details: `Deleted seed data: ${deletedZones} zones, ${deletedRegions} regions, ${deletedBranches} branches`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: `Seed data deleted: ${deletedZones} zones, ${deletedRegions} regions, ${deletedBranches} branches`,
    data: {
      zones: deletedZones,
      regions: deletedRegions,
      branches: deletedBranches,
      total: deletedZones + deletedRegions + deletedBranches,
    },
  });
});

/**
 * @desc    Merge organization units
 * @route   POST /api/org/units/:id/merge
 * @access  Private (Tenant Admin, Super Admin)
 */
exports.mergeUnits = asyncHandler(async (req, res) => {
  const { targetUnitId } = req.body;
  const sourceUnitId = req.params.id;

  if (!targetUnitId) {
    return res.status(400).json({
      success: false,
      message: 'Target unit ID is required',
    });
  }

  const sourceUnit = await OrganizationUnit.findOne({
    _id: sourceUnitId,
    tenantId: req.tenantId,
  });

  if (!sourceUnit) {
    return res.status(404).json({
      success: false,
      message: 'Source unit not found',
    });
  }

  const targetUnit = await OrganizationUnit.findOne({
    _id: targetUnitId,
    tenantId: req.tenantId,
  });

  if (!targetUnit) {
    return res.status(404).json({
      success: false,
      message: 'Target unit not found',
    });
  }

  if (sourceUnit._id.toString() === targetUnitId) {
    return res.status(400).json({
      success: false,
      message: 'Cannot merge unit with itself',
    });
  }

  // BR-ORG-10: Automatically transfer all employees
  const employees = await Employee.find({
    tenantId: req.tenantId,
    postingUnitId: sourceUnitId,
  });

  const EmployeeTransfer = require('../models/EmployeeTransfer');
  const transferPromises = employees.map(async (employee) => {
    // Create transfer record
    await EmployeeTransfer.create({
      tenantId: req.tenantId,
      employeeId: employee._id,
      fromUnitId: sourceUnitId,
      toUnitId: targetUnitId,
      transferType: 'Permanent',
      effectiveDate: new Date(),
      reason: `Automatic transfer due to unit merge: ${sourceUnit.unitCode} merged into ${targetUnit.unitCode}`,
      status: 'Completed',
      initiatedBy: req.user._id,
      approvedBy: req.user._id,
      approvedAt: new Date(),
    });

    // Update employee posting unit
    if (!employee.transferHistory) {
      employee.transferHistory = [];
    }
    employee.transferHistory.push({
      fromUnitId: sourceUnitId,
      toUnitId: targetUnitId,
      effectiveDate: new Date(),
      transferType: 'Permanent',
      reason: `Automatic transfer due to unit merge`,
      changedBy: req.user._id,
      changedAt: new Date(),
    });
    employee.postingUnitId = targetUnitId;
    await employee.save();
  });

  await Promise.all(transferPromises);

  // Move children units to target unit
  await OrganizationUnit.updateMany(
    {
      tenantId: req.tenantId,
      parentUnitId: sourceUnitId,
    },
    {
      parentUnitId: targetUnitId,
    }
  );

  // Deactivate source unit
  sourceUnit.isActive = false;
  await sourceUnit.save();

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || 'System',
    userEmail: req.user.email,
    action: 'Merge',
    module: 'Organization Structure',
    entityType: 'OrganizationUnit',
    entityId: sourceUnit._id,
    details: `Merged unit ${sourceUnit.unitCode} into ${targetUnit.unitCode}. ${employees.length} employees transferred automatically.`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: `Unit merged successfully. ${employees.length} employees transferred to ${targetUnit.unitCode}`,
    data: {
      sourceUnit: sourceUnit.unitCode,
      targetUnit: targetUnit.unitCode,
      employeesTransferred: employees.length,
    },
  });
});
