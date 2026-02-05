const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema({
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
  },
  grade: {
    type: String,
    trim: true,
  },
  level: {
    type: Number,
    default: 1,
    min: 1,
    max: 10,
  },
  minSalary: {
    type: Number,
    default: 0,
  },
  maxSalary: {
    type: Number,
    default: 0,
  },
  description: {
    type: String,
    trim: true,
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

// Compound index for tenantId and name (unique designation per tenant)
designationSchema.index({ tenantId: 1, name: 1 }, { unique: true });

designationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Designation', designationSchema);
