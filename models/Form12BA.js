const mongoose = require('mongoose');

/**
 * Form 12BA Model
 * BRD Requirement: BR-TAX-011
 * Form 12BA for retirement contributions (NPS, etc.)
 */
const form12BASchema = new mongoose.Schema({
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
  financialYear: {
    type: String,
    required: true,
    index: true,
  },
  // Employer contributions
  employerContributions: {
    nps: Number,
    epf: Number,
    other: Number,
    total: Number,
  },
  // Employee contributions
  employeeContributions: {
    nps: Number,
    epf: Number,
    other: Number,
    total: Number,
  },
  // Total contributions
  totalContributions: Number,
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Generated', 'Issued'],
    default: 'Draft',
  },
  generatedDate: Date,
  issuedDate: Date,
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  pdfUrl: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

form12BASchema.index({ tenantId: 1, employeeId: 1, financialYear: 1 }, { unique: true });
form12BASchema.index({ tenantId: 1, financialYear: 1 });

form12BASchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Form12BA', form12BASchema);
