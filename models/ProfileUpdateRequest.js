const mongoose = require('mongoose');

/**
 * ProfileUpdateRequest Model
 * BRD: BR-P2-005 - Employee Self-Service (ESS) - Profile update request workflow
 */
const profileUpdateRequestSchema = new mongoose.Schema({
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
  requestType: {
    type: String,
    enum: ['PERSONAL', 'CONTACT', 'BANK', 'ADDRESS', 'OTHER'],
    default: 'PERSONAL',
    comment: 'Category of update',
  },
  requestedFields: [
    {
      field: { type: String, required: true },
      currentValue: { type: mongoose.Schema.Types.Mixed },
      requestedValue: { type: mongoose.Schema.Types.Mixed, required: true },
      label: { type: String },
    },
  ],
  reason: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true,
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewedAt: Date,
  reviewComments: {
    type: String,
    trim: true,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

profileUpdateRequestSchema.index({ tenantId: 1, employeeId: 1 });
profileUpdateRequestSchema.index({ tenantId: 1, status: 1 });

profileUpdateRequestSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  if (typeof next === 'function') next();
});

module.exports = mongoose.model('ProfileUpdateRequest', profileUpdateRequestSchema);
