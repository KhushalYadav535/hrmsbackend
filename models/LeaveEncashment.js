const mongoose = require('mongoose');

/**
 * Leave Encashment Model
 * BRD Requirement: Leave encashment for unused leave balance
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
  leaveType: {
    type: String,
    required: true,
    trim: true,
    comment: 'Type of leave being encashed',
  },
  days: {
    type: Number,
    required: true,
    min: 1,
    comment: 'Number of days being encashed',
  },
  dailyRate: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Daily salary rate for calculation',
  },
  encashmentAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Total encashment amount (days * dailyRate)',
  },
  financialYear: {
    type: Number,
    required: true,
    comment: 'Financial year for which encashment is requested',
  },
  reason: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Processed', 'Paid'],
    default: 'Pending',
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  requestedDate: {
    type: Date,
    default: Date.now,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedDate: Date,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  processedDate: Date,
  paymentDate: Date,
  paymentReference: {
    type: String,
    trim: true,
  },
  remarks: {
    type: String,
    trim: true,
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

// Indexes
leaveEncashmentSchema.index({ tenantId: 1, employeeId: 1, financialYear: 1 });
leaveEncashmentSchema.index({ tenantId: 1, status: 1 });
leaveEncashmentSchema.index({ tenantId: 1, employeeId: 1, status: 1 });

leaveEncashmentSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  // Auto-calculate encashment amount
  if (this.days && this.dailyRate) {
    this.encashmentAmount = this.days * this.dailyRate;
  }
  next();
});

module.exports = mongoose.model('LeaveEncashment', leaveEncashmentSchema);
