const mongoose = require('mongoose');

/**
 * Posting History Model
 * Tracks employee posting history across locations and departments
 * BRD: BR-P2-003 - Transfer Management
 */
const postingHistorySchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  fromUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrganizationUnit',
  },
  toUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrganizationUnit',
  },
  fromLocation: {
    type: String,
  },
  toLocation: {
    type: String,
    required: true,
  },
  fromDepartment: {
    type: String,
  },
  toDepartment: {
    type: String,
    required: true,
  },
  effectiveDate: {
    type: Date,
    required: true,
    index: true,
  },
  transferOrderNumber: {
    type: String,
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
}, {
  timestamps: true,
  collection: 'posting_histories',
});

// Index for employee posting history lookup
postingHistorySchema.index({ employeeId: 1, effectiveDate: -1 });
postingHistorySchema.index({ tenantId: 1, employeeId: 1 });

module.exports = mongoose.model('PostingHistory', postingHistorySchema);
