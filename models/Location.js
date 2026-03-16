const mongoose = require('mongoose');

/**
 * Location Master
 * Spec C1-02: Location dropdown in Add Employee form populated from this master.
 * BR-C1-06: Only Active locations shown in dropdown.
 * BR-C1-07: Location stored as FK reference.
 * BR-C1-08: Location data feeds into payroll tax, compliance, cost center, leave policy.
 */
const locationSchema = new mongoose.Schema({
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
    minlength: 2,
    maxlength: 100,
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  state: {
    type: String,
    trim: true,
  },
  city: {
    type: String,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  pincode: {
    type: String,
    trim: true,
  },
  // Link Location to Branch (OrganizationUnit)
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrganizationUnit',
    index: true,
    comment: 'BR-ORG-01: Location linked to Branch Master. Location transfer triggers Branch transfer workflow.',
  },
  // BR-C1-06: Only Active locations shown; Archived for historical records
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Archived'],
    default: 'Active',
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

locationSchema.index({ tenantId: 1, code: 1 }, { unique: true });
locationSchema.index({ tenantId: 1, name: 1 });
locationSchema.index({ tenantId: 1, state: 1 });

locationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Location', locationSchema);
