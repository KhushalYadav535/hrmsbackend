const mongoose = require('mongoose');

/**
 * Biometric Punch Model
 * BRD: BR-P1-002 - Attendance Enhancements - Biometric Integration
 */
const biometricPunchSchema = new mongoose.Schema({
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
  biometricId: {
    type: String,
    required: true,
    comment: 'Employee ID in biometric device',
  },
  punchTime: {
    type: Date,
    required: true,
    index: true,
  },
  deviceId: {
    type: String,
    required: true,
    comment: 'Biometric device ID',
  },
  deviceLocation: {
    type: String,
    trim: true,
  },
  punchType: {
    type: String,
    enum: ['IN', 'OUT', 'UNKNOWN'],
    default: 'UNKNOWN',
    comment: 'Auto-detected or manual',
  },
  syncStatus: {
    type: String,
    enum: ['PENDING', 'SYNCED', 'PROCESSED', 'ERROR'],
    default: 'PENDING',
  },
  processedDate: {
    type: Date,
    comment: 'When punch was processed into attendance',
  },
  remarks: {
    type: String,
    trim: true,
  },
  rawData: {
    type: mongoose.Schema.Types.Mixed,
    comment: 'Raw data from biometric device',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

biometricPunchSchema.index({ tenantId: 1, employeeId: 1, punchTime: 1 });
biometricPunchSchema.index({ tenantId: 1, deviceId: 1, punchTime: 1 });
biometricPunchSchema.index({ tenantId: 1, syncStatus: 1 });

module.exports = mongoose.model('BiometricPunch', biometricPunchSchema);
