const mongoose = require('mongoose');

/**
 * SeparationClearance Model
 * Tracks department-wise clearance checklist for employee exit
 * BRD: BR-P0-005 - Exit Clearance Workflow
 */
const separationClearanceSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  separationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmployeeSeparation',
    required: true,
    index: true,
  },
  department: {
    type: String,
    enum: ['IT', 'FINANCE', 'HR', 'ADMIN', 'LIBRARY', 'SECURITY', 'ACCOUNTS'],
    required: true,
    index: true,
  },
  clearanceOfficerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'User responsible for this department clearance',
  },
  clearanceOfficerName: {
    type: String,
    comment: 'Name of clearance officer (denormalized for reporting)',
  },
  status: {
    type: String,
    enum: ['PENDING', 'CLEARED', 'WAIVED'],
    default: 'PENDING',
    index: true,
  },
  remarks: {
    type: String,
    comment: 'Department-specific clearance remarks',
  },
  clearedDate: {
    type: Date,
    comment: 'Date when clearance was completed',
  },
  // Department-specific checklist items (flexible structure)
  checklistItems: [{
    item: String,
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'NA'], default: 'PENDING' },
    remarks: String,
  }],
}, {
  timestamps: true,
});

// Indexes
separationClearanceSchema.index({ tenantId: 1, separationId: 1, department: 1 }, { unique: true });
separationClearanceSchema.index({ tenantId: 1, status: 1 });

// Pre-save hook: Update clearedDate when status changes to CLEARED
separationClearanceSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'CLEARED' && !this.clearedDate) {
    this.clearedDate = new Date();
  }
  next();
});

module.exports = mongoose.model('SeparationClearance', separationClearanceSchema);
