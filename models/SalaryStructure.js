const mongoose = require('mongoose');

const salaryComponentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['earning', 'deduction'],
    required: true,
  },
  calculationType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true,
  },
  base: {
    type: String,
    trim: true,
    comment: 'Base component for percentage calculation (e.g., "Basic")',
  },
  value: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Percentage or fixed amount',
  },
  isFixed: {
    type: Boolean,
    default: false,
    comment: 'Cannot be deleted/moved if true (e.g., Basic)',
  },
  applicable: {
    type: Boolean,
    default: true,
  },
  order: {
    type: Number,
    default: 0,
    comment: 'Display order',
  },
}, { _id: false });

const salaryStructureSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    comment: 'Structure name (e.g., "Grade A - Manager")',
  },
  grade: {
    type: String,
    trim: true,
    comment: 'Grade/Level (e.g., "M1", "E2")',
  },
  location: {
    type: String,
    trim: true,
    comment: 'Location (e.g., "Metro", "Non-Metro")',
  },
  version: {
    type: String,
    default: '1.0',
    trim: true,
  },
  effectiveFrom: {
    type: Date,
    required: true,
    default: Date.now,
  },
  effectiveTo: {
    type: Date,
    comment: 'End date (null if currently active)',
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Draft'],
    default: 'Active',
  },
  components: {
    type: [salaryComponentSchema],
    default: [],
    validate: {
      validator: function(components) {
        // Must have at least one component
        return components && components.length > 0;
      },
      message: 'Salary structure must have at least one component',
    },
  },
  baseSalary: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Reference base salary for simulation/calculation',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
});

// Compound index for tenantId and name
salaryStructureSchema.index({ tenantId: 1, name: 1 });
salaryStructureSchema.index({ tenantId: 1, status: 1 });
salaryStructureSchema.index({ tenantId: 1, effectiveFrom: 1 });

// Pre-save hook to update updatedAt timestamp
salaryStructureSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('SalaryStructure', salaryStructureSchema);
