const mongoose = require('mongoose');

const rolePermissionSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: [
      'Super Admin',
      'Tenant Admin',
      'HR Administrator',
      'Payroll Administrator',
      'Finance Administrator',
      'Manager',
      'Employee',
      'Auditor',
    ],
    required: true,
  },
  permissions: [{
    type: String,
    trim: true,
  }],
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

// Compound index for tenantId and role (unique role per tenant)
rolePermissionSchema.index({ tenantId: 1, role: 1 }, { unique: true });

rolePermissionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('RolePermission', rolePermissionSchema);
