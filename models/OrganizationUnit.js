const mongoose = require('mongoose');

/**
 * OrganizationUnit Model
 * BRD Requirement: Multi-level organization hierarchy (HO → ZO → RO → Branch)
 * Supports Indian Bank structure: Head Office, Zonal Offices, Regional Offices, Branches
 */
const organizationUnitSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  unitCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    unique: true,
    index: true,
    validate: {
      validator: function(value) {
        // Validate unit code format based on unit type
        const codePatterns = {
          'HO': /^HO-\d{3}$/,           // HO-001
          'ZO': /^ZO-[A-Z]{3,6}-\d{2}$/, // ZO-SOUTH-01, ZO-MUM-01
          'RO': /^RO-[A-Z0-9]{4,6}$/,   // RO-MUM1, RO-DEL01
          'BRANCH': /^BR-\d{6}$/,       // BR-000001
          'DEPARTMENT': /^DEPT-[A-Z0-9]{3,10}$/, // DEPT-HR, DEPT-FIN01
        };
        return codePatterns[this.unitType] ? codePatterns[this.unitType].test(value) : true;
      },
      message: 'Unit code format does not match unit type',
    },
    comment: 'Unique unit code (e.g., HO-001, ZO-SOUTH-01, RO-MUM1, BR-000001)',
  },
  unitName: {
    type: String,
    required: true,
    trim: true,
    comment: 'Full name of the organizational unit',
  },
  unitType: {
    type: String,
    enum: ['HO', 'ZO', 'RO', 'BRANCH', 'DEPARTMENT'],
    required: true,
    index: true,
    comment: 'Type of organizational unit',
  },
  parentUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrganizationUnit',
    default: null,
    index: true,
    comment: 'Parent unit (null for Head Office)',
    validate: {
      validator: function(value) {
        // HO cannot have a parent
        if (this.unitType === 'HO' && value != null) {
          return false;
        }
        // BRANCH: parent optional (e.g. small banks: only HO + branches) or under HO / ZO / RO
        if (this.unitType === 'BRANCH') {
          return true;
        }
        // All other non-HO types require a parent
        if (this.unitType !== 'HO' && (value === null || value === undefined)) {
          return false;
        }
        return true;
      },
      message: 'HO cannot have a parent; BRANCH may have no parent; other unit types require a parent',
    },
  },
  unitHeadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null,
    comment: 'Employee who is the head of this unit',
  },
  state: {
    type: String,
    trim: true,
    comment: 'State where unit is located',
  },
  city: {
    type: String,
    trim: true,
    comment: 'City where unit is located',
  },
  address: {
    type: String,
    trim: true,
    comment: 'Full address of the unit',
  },
  pinCode: {
    type: String,
    trim: true,
    match: /^[0-9]{6}$/,
    validate: {
      validator: function(value) {
        return !value || /^[0-9]{6}$/.test(value);
      },
      message: 'Pin code must be 6 digits',
    },
    comment: 'PIN code (6 digits)',
  },
  // Branch-specific fields (for BRANCH type)
  branchCode: {
    type: String,
    trim: true,
    uppercase: true,
    comment: 'Branch Code / IFSC (e.g., IBKL0000001)',
  },
  branchType: {
    type: String,
    enum: ['Urban', 'Semi-Urban', 'Rural'],
    comment: 'Branch type classification',
  },
  openingDate: {
    type: Date,
    comment: 'Branch opening date',
  },
  // Zone/Region-specific fields
  headquartersCity: {
    type: String,
    trim: true,
    comment: 'Headquarters city for Zone/Region',
  },
  effectiveDate: {
    type: Date,
    comment: 'Effective date for unit activation',
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
    comment: 'Whether unit is currently active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true, // Automatically manage createdAt and updatedAt
});

// Compound indexes
organizationUnitSchema.index({ tenantId: 1, unitCode: 1 }, { unique: true });
organizationUnitSchema.index({ tenantId: 1, unitType: 1 });
organizationUnitSchema.index({ tenantId: 1, parentUnitId: 1 });
organizationUnitSchema.index({ tenantId: 1, unitHeadId: 1 });
organizationUnitSchema.index({ tenantId: 1, isActive: 1 });

// Virtual for hierarchy path (e.g., "HO → ZO-SOUTH → RO-MUM1")
organizationUnitSchema.virtual('hierarchyPath', {
  ref: 'OrganizationUnit',
  localField: 'parentUnitId',
  foreignField: '_id',
  justOne: true,
});

// Pre-save hook to validate hierarchy
organizationUnitSchema.pre('save', async function() {
  // Validate parent unit exists and is correct type
  if (this.parentUnitId && this.unitType !== 'HO') {
    const parentUnit = await mongoose.model('OrganizationUnit').findById(this.parentUnitId);
    if (!parentUnit) {
      throw new Error('Parent unit not found');
    }
    
    // Validate hierarchy: ZO → HO; RO → HO or ZO (small banks: regions under HO); BRANCH → HO / ZO / RO or no parent
    const validHierarchy = {
      'ZO': ['HO'],
      'RO': ['HO', 'ZO'],
      'BRANCH': ['HO', 'RO', 'ZO'],
    };
    
    if (validHierarchy[this.unitType] && !validHierarchy[this.unitType].includes(parentUnit.unitType)) {
      throw new Error(`Invalid hierarchy: ${this.unitType} cannot be under ${parentUnit.unitType}`);
    }
  }
  
  this.updatedAt = Date.now();
});

// Method to get all child units
organizationUnitSchema.methods.getChildren = async function() {
  return await mongoose.model('OrganizationUnit').find({
    tenantId: this.tenantId,
    parentUnitId: this._id,
    isActive: true,
  }).sort({ unitCode: 1 });
};

// Method to get all descendant units (recursive)
organizationUnitSchema.methods.getDescendants = async function() {
  const descendants = [];
  const children = await this.getChildren();
  
  for (const child of children) {
    descendants.push(child);
    const childDescendants = await child.getDescendants();
    descendants.push(...childDescendants);
  }
  
  return descendants;
};

// Static method to get full hierarchy tree
organizationUnitSchema.statics.getHierarchyTree = async function(tenantId) {
  // Get all units for tenant
  // Note: unitHeadId populate may fail if Employee model not loaded - that's okay, we'll skip it
  let allUnits;
  try {
    allUnits = await this.find({ tenantId, isActive: true }).populate('unitHeadId', 'firstName lastName employeeCode');
  } catch (error) {
    // If Employee model not loaded (e.g., in tests), just get units without populate
    allUnits = await this.find({ tenantId, isActive: true });
  }
  
  // Build tree structure
  const unitMap = new Map();
  const roots = [];
  
  // Create map of all units
  allUnits.forEach(unit => {
    unitMap.set(unit._id.toString(), { ...unit.toObject(), children: [] });
  });
  
  // Build tree
  allUnits.forEach(unit => {
    const unitObj = unitMap.get(unit._id.toString());
    if (!unit.parentUnitId) {
      roots.push(unitObj);
    } else {
      const parent = unitMap.get(unit.parentUnitId.toString());
      if (parent) {
        parent.children.push(unitObj);
      }
    }
  });
  
  return roots;
};

module.exports = mongoose.model('OrganizationUnit', organizationUnitSchema);
