const mongoose = require('mongoose');

/**
 * Certificate Model - LMS
 * BRD: BR-P1-005 - Learning Management System
 */
const certificateSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  certificateNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  trainingAssignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrainingAssignment',
  },
  issueDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  expiryDate: {
    type: Date,
    comment: 'If null, certificate does not expire',
  },
  score: {
    type: Number,
    comment: 'Score achieved (%)',
  },
  pdfUrl: {
    type: String,
    comment: 'Generated certificate PDF URL',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  verifiedDate: {
    type: Date,
  },
  revoked: {
    type: Boolean,
    default: false,
  },
  revokedDate: {
    type: Date,
  },
  revokedReason: {
    type: String,
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

certificateSchema.index({ tenantId: 1, employeeId: 1 });
certificateSchema.index({ tenantId: 1, certificateNumber: 1 }, { unique: true });
certificateSchema.index({ tenantId: 1, expiryDate: 1 });

certificateSchema.pre('save', async function (next) {
  this.updatedAt = Date.now();
  
  // Generate certificate number if new
  if (this.isNew && !this.certificateNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Certificate').countDocuments({
      tenantId: this.tenantId,
      certificateNumber: new RegExp(`^CERT-${year}-`),
    });
    this.certificateNumber = `CERT-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Certificate', certificateSchema);
