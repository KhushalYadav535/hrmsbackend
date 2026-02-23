const mongoose = require('mongoose');

/**
 * Scheduled Report Model
 * BRD: BR-P1-006 - Reports & Analytics Enhancement
 */
const scheduledReportSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReportTemplate',
    required: true,
  },
  reportName: {
    type: String,
    required: true,
    trim: true,
  },
  frequency: {
    type: String,
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
    required: true,
  },
  scheduleConfig: {
    dayOfWeek: Number,
    dayOfMonth: Number,
    time: String,
    timezone: { type: String, default: 'Asia/Kolkata' },
  },
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
  filters: {
    type: mongoose.Schema.Types.Mixed,
    comment: 'Report-specific filters',
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'PAUSED', 'COMPLETED'],
    default: 'ACTIVE',
    index: true,
  },
  lastRunDate: {
    type: Date,
  },
  nextRunDate: {
    type: Date,
    index: true,
  },
  runHistory: [{
    runDate: Date,
    status: { type: String, enum: ['SUCCESS', 'FAILED'] },
    recordCount: Number,
    fileUrl: String,
    error: String,
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
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

scheduledReportSchema.index({ tenantId: 1, status: 1 });
scheduledReportSchema.index({ tenantId: 1, nextRunDate: 1 });

scheduledReportSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('ScheduledReport', scheduledReportSchema);
