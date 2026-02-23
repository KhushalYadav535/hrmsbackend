const mongoose = require('mongoose');

/**
 * Leave Encashment Model
 * BRD: BR-P1-003 - Leave Management Enhancements
 */
const leaveEncashmentSchema = new mongoose.Schema({
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
  encashmentDate: {
    type: Date,
    required: true,
    index: true,
  },
  leaveType: {
    type: String,
    required: true,
    trim: true,
  },
  encashedDays: {
    type: Number,
    required: true,
    min: 1,
  },
  encashmentRate: {
    type: Number,
    required: true,
    comment: 'Rate per day (Basic + DA) / 26',
  },
  encashmentAmount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'PAID'],
    default: 'PENDING',
    index: true,
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
  payrollMonth: {
    type: String,
    comment: 'Format: YYYY-MM',
    index: true,
  },
  payrollProcessed: {
    type: Boolean,
    default: false,
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

leaveEncashmentSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
leaveEncashmentSchema.index({ tenantId: 1, employeeId: 1 });
leaveEncashmentSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('LeaveEncashment', leaveEncashmentSchema);
