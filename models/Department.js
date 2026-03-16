const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
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
  // Spec C2: Department Code — unique, alphanumeric
  code: {
    type: String,
    trim: true,
    uppercase: true,
  },
  // Spec C2: Department Head is NOT mandatory at creation (BR-C2-01, BR-C2-02)
  // Can be assigned later via Edit Department form
  head: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null,
    comment: 'BR-C2-01: Not mandatory at creation. Assigned via Edit.',
  },
  // BR-C2-05: Track department head changes with effective dates
  headHistory: [{
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    effectiveDate: { type: Date, required: true },
    action: { type: String, enum: ['assigned', 'removed'], required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  }],
  employees: {
    type: Number,
    default: 0,
  },
  costCenter: {
    type: String,
    trim: true,
  },
  // Spec C2: Description field (optional, max 500 chars)
  description: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  // Spec C2: Parent Department (optional, searchable dropdown)
  parentDepartment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
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

departmentSchema.index({ tenantId: 1, name: 1 }, { unique: true });
departmentSchema.index({ tenantId: 1, code: 1 }, { unique: true, sparse: true });

// Pre-save hook to update updatedAt timestamp
departmentSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Department', departmentSchema);
