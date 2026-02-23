const mongoose = require('mongoose');

/**
 * Platform Modules Master
 * Defines all available modules in the platform
 * BRD: Dynamic Module Management System - DM-001
 */
const platformModuleSchema = new mongoose.Schema({
  moduleCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  moduleName: {
    type: String,
    required: true,
    trim: true,
  },
  moduleCategory: {
    type: String,
    required: true,
    enum: ['CORE', 'STANDARD', 'ADVANCED', 'INTEGRATION'],
    index: true,
  },
  description: {
    type: String,
    trim: true,
  },
  icon: {
    type: String,
    trim: true,
  },
  sortOrder: {
    type: Number,
    default: 100,
  },
  
  // Module characteristics
  isCore: {
    type: Boolean,
    default: false,
    // Core modules cannot be disabled
  },
  requiresSetup: {
    type: Boolean,
    default: false,
    // Does module need initial configuration?
  },
  hasPricing: {
    type: Boolean,
    default: true,
    // Is this a paid module?
  },
  pricingModel: {
    type: String,
    enum: ['FLAT_FEE', 'PER_USER', 'PER_TRANSACTION', 'BUNDLED'],
  },
  basePrice: {
    type: Number,
    default: 0,
    // Monthly cost if applicable
  },
  
  // Technical metadata
  frontendRoute: {
    type: String,
    trim: true,
    // Main route for this module
  },
  backendService: {
    type: String,
    trim: true,
    // Microservice name if applicable
  },
  databaseSchema: {
    type: String,
    trim: true,
    // Schema name if isolated
  },
  apiEndpoints: {
    type: [String],
    default: [],
    // List of API endpoints for this module
  },
  uiComponents: {
    type: [String],
    default: [],
    // List of UI components to load/hide
  },
  permissions: {
    type: [String],
    default: [],
    // Default permissions for this module
    // Example: ["MODULE_VIEW", "MODULE_CREATE", "MODULE_EDIT", "MODULE_DELETE", "MODULE_APPROVE"]
  },
  
  // Dependencies
  parentModuleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PlatformModule',
    // If this is a sub-module
  },
  dependsOnModules: {
    type: [String],
    default: [],
    // Array of module_codes this module depends on
    // Example: ["PAYROLL", "PIS"]
  },
  conflictsWithModules: {
    type: [String],
    default: [],
    // Modules that cannot be active simultaneously
  },
  
  // Metadata
  version: {
    type: String,
    trim: true,
  },
  releaseDate: {
    type: Date,
  },
  documentationUrl: {
    type: String,
    trim: true,
  },
  
  isActive: {
    type: Boolean,
    default: true,
    // Is this module available on the platform?
    index: true,
  },
  
  createdBy: {
    type: String,
    trim: true,
  },
  updatedBy: {
    type: String,
    trim: true,
  },
}, {
  timestamps: true,
});

// Indexes
platformModuleSchema.index({ moduleCategory: 1, isActive: 1 });
platformModuleSchema.index({ isCore: 1 });

module.exports = mongoose.model('PlatformModule', platformModuleSchema);
