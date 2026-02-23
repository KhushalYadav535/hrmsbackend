const mongoose = require('mongoose');

/**
 * Compensatory Off (Comp-Off) Model
 * BRD: BR-P1-003 - Leave Management Enhancements
 */
const compOffSchema = new mongoose.Schema({
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
  workedDate: {
    type: Date,
    required: true,
    index: true,
  },
  workedHours: {
    type: Number,
    required: true,
    min: 1,
    max: 8,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  compOffDate: {
    type: Date,
    comment: 'Date when comp-off is availed',
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'AVAILED', 'EXPIRED'],
    default: 'PENDING',
    index: true,
  },
  expiryDate: {
    type: Date,
    comment: 'Comp-off expiry date (typically 3 months)',
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedDate: Date,
  rejectionReason: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

compOffSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
compOffSchema.index({ tenantId: 1, employeeId: 1 });
compOffSchema.index({ tenantId: 1, status: 1 });
compOffSchema.index({ expiryDate: 1 });

module.exports = mongoose.model('CompOff', compOffSchema);
