/**
 * Bank Transaction Model
 * BRD Requirement: INT-CBS-007
 * Tracks salary credit transactions and their status
 */

const mongoose = require('mongoose');

const bankTransactionSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  payrollId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payroll',
    required: true,
    index: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  employeeCode: {
    type: String,
    required: true,
  },
  transactionReference: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  accountNumber: {
    type: String,
    required: true,
  },
  ifscCode: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  transactionType: {
    type: String,
    enum: ['NEFT', 'RTGS', 'INTERNAL'],
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Success', 'Failed', 'Reversed'],
    default: 'Pending',
    index: true,
  },
  transactionDate: {
    type: Date,
    required: true,
  },
  creditDate: {
    type: Date,
  },
  utrNumber: {
    type: String, // UTR for NEFT/RTGS
  },
  failureReason: {
    type: String,
  },
  retryCount: {
    type: Number,
    default: 0,
  },
  lastRetryDate: {
    type: Date,
  },
  cbsResponse: {
    type: mongoose.Schema.Types.Mixed, // Store full CBS API response
  },
  month: {
    type: String,
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  remarks: {
    type: String,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Indexes for efficient queries
bankTransactionSchema.index({ tenantId: 1, status: 1 });
bankTransactionSchema.index({ tenantId: 1, month: 1, year: 1 });
bankTransactionSchema.index({ transactionDate: 1 });
bankTransactionSchema.index({ employeeId: 1, transactionDate: -1 });

module.exports = mongoose.model('BankTransaction', bankTransactionSchema);
