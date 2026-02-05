const mongoose = require('mongoose');

/**
 * Form 24Q Model
 * BRD Requirement: BR-TAX-006, BR-TAX-009
 * Quarterly TDS return for TRACES upload
 */
const form24QSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  financialYear: {
    type: String,
    required: true,
    index: true,
  },
  quarter: {
    type: String,
    enum: ['Q1', 'Q2', 'Q3', 'Q4'],
    required: true,
    index: true,
  },
  // Employer details
  employerDetails: {
    tan: String,
    name: String,
    address: String,
    state: String,
    pinCode: String,
    email: String,
    phone: String,
  },
  // Employee-wise TDS details
  employeeTdsDetails: [{
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    pan: String,
    name: String,
    sectionCode: String, // e.g., 192 (Salary)
    tdsAmount: Number,
    tdsDeposited: Number,
    challanDetails: [{
      challanNumber: String,
      challanDate: Date,
      bsrCode: String,
      amount: Number,
    }],
  }],
  // Summary
  totalTdsAmount: { type: Number, default: 0 },
  totalTdsDeposited: { type: Number, default: 0 },
  totalChallans: { type: Number, default: 0 },
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Generated', 'Uploaded', 'Acknowledged'],
    default: 'Draft',
  },
  generatedDate: Date,
  uploadedDate: Date,
  tracesAcknowledgmentNumber: String,
  jsonFileUrl: String,
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

form24QSchema.index({ tenantId: 1, financialYear: 1, quarter: 1 }, { unique: true });
form24QSchema.index({ tenantId: 1, status: 1 });

form24QSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Form24Q', form24QSchema);
