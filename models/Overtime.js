const mongoose = require('mongoose');

/**
 * Overtime Model
 * BRD: BR-P1-002 - Attendance Enhancements - Overtime Management
 */
const overtimeSchema = new mongoose.Schema({
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
  date: {
    type: Date,
    required: true,
    index: true,
  },
  requestType: {
    type: String,
    enum: ['PRE_APPROVAL', 'AUTO_DETECTED', 'MANUAL'],
    default: 'PRE_APPROVAL',
  },
  requestedHours: {
    type: Number,
    comment: 'Requested OT hours (for pre-approval)',
  },
  actualHours: {
    type: Number,
    required: true,
    comment: 'Actual OT hours worked',
  },
  otType: {
    type: String,
    enum: ['WEEKDAY', 'WEEKEND', 'HOLIDAY'],
    required: true,
  },
  otRate: {
    type: Number,
    required: true,
    comment: 'OT multiplier (1.5x, 2x, 2.5x)',
  },
  hourlyRate: {
    type: Number,
    required: true,
    comment: 'Employee hourly rate (Basic / 26 / 8)',
  },
  otAmount: {
    type: Number,
    required: true,
    comment: 'Calculated OT amount',
  },
  reason: {
    type: String,
    trim: true,
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
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedDate: {
    type: Date,
  },
  rejectionReason: {
    type: String,
    trim: true,
  },
  paidInPayrollId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payroll',
    comment: 'Payroll ID where OT was paid',
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

overtimeSchema.index({ tenantId: 1, employeeId: 1, date: 1 });
overtimeSchema.index({ tenantId: 1, status: 1 });
overtimeSchema.index({ tenantId: 1, date: 1 });

overtimeSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Calculate OT amount
  if (this.actualHours && this.hourlyRate && this.otRate) {
    this.otAmount = this.actualHours * this.hourlyRate * this.otRate;
  }
  
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Overtime', overtimeSchema);
