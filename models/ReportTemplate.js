const mongoose = require('mongoose');

/**
 * Report Template Model
 * BRD: BR-P1-006 - Reports & Analytics Enhancement
 */
const reportTemplateSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  templateCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  templateName: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    enum: ['EMPLOYEE', 'PAYROLL', 'ATTENDANCE', 'LEAVE', 'PERFORMANCE', 'RECRUITMENT', 'FINANCIAL', 'COMPLIANCE', 'CUSTOM'],
    required: true,
  },
  description: {
    type: String,
    trim: true,
  },
  // Report configuration
  dataSource: {
    type: String,
    required: true,
    comment: 'Main data source (e.g., Employee, Payroll, LeaveRequest)',
  },
  columns: [{
    field: String,
    label: String,
    dataType: String,
    format: String,
    aggregate: String, // SUM, AVG, COUNT, MIN, MAX
    visible: { type: Boolean, default: true },
    order: Number,
  }],
  filters: [{
    field: String,
    operator: String, // EQUALS, NOT_EQUALS, CONTAINS, GREATER_THAN, LESS_THAN, BETWEEN, IN
    defaultValue: mongoose.Schema.Types.Mixed,
    required: Boolean,
  }],
  grouping: [{
    field: String,
    order: Number,
  }],
  sorting: [{
    field: String,
    direction: { type: String, enum: ['ASC', 'DESC'] },
    order: Number,
  }],
  // Scheduling
  canSchedule: {
    type: Boolean,
    default: false,
  },
  scheduleConfig: {
    frequency: {
      type: String,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
    },
    dayOfWeek: Number, // 0-6 (Sunday-Saturday)
    dayOfMonth: Number, // 1-31
    time: String, // HH:MM format
    recipients: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      email: String,
      role: String,
    }],
    format: {
      type: String,
      enum: ['EXCEL', 'PDF', 'CSV'],
      default: 'EXCEL',
    },
  },
  // Access control
  accessibleBy: [{
    type: String,
    enum: ['Super Admin', 'Tenant Admin', 'HR Administrator', 'Payroll Administrator', 'Finance Administrator', 'Manager', 'Employee', 'Auditor'],
  }],
  isSystemTemplate: {
    type: Boolean,
    default: false,
    comment: 'System templates cannot be deleted',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  isActive: {
    type: Boolean,
    default: true,
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

reportTemplateSchema.index({ tenantId: 1, templateCode: 1 }, { unique: true });
reportTemplateSchema.index({ tenantId: 1, category: 1 });
reportTemplateSchema.index({ tenantId: 1, isActive: 1 });

reportTemplateSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('ReportTemplate', reportTemplateSchema);
