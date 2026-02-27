const mongoose = require('mongoose');

/**
 * Travel Request Model
 * BRD Requirement: HRMS-TRV-001, HRMS-TRV-002
 * Supports travel request creation with travel type (domestic, international, local)
 */
const travelRequestSchema = new mongoose.Schema({
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
  travelType: {
    type: String,
    enum: ['Domestic', 'International', 'Local Conveyance', 'Transfer/Relocation', 'Training/Conference'],
    required: true,
  },
  purpose: {
    type: String,
    required: true,
    trim: true,
    comment: 'Purpose of travel',
  },
  departureDate: {
    type: Date,
    required: true,
  },
  returnDate: {
    type: Date,
    required: true,
  },
  origin: {
    type: String,
    required: true,
    trim: true,
  },
  destination: {
    type: String,
    required: true,
    trim: true,
  },
  mode: {
    type: String,
    enum: ['Air', 'Train', 'Bus', 'Car', 'Own Vehicle', 'Other'],
    required: true,
  },
  estimatedAmount: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Estimated total expense',
  },
  estimatedBreakdown: {
    travel: { type: Number, default: 0 },
    accommodation: { type: Number, default: 0 },
    dailyAllowance: { type: Number, default: 0 },
    localConveyance: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
  },
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Cancelled', 'Completed'],
    default: 'Draft',
  },
  remarks: {
    type: String,
    trim: true,
  },
  // Approval workflow
  submittedDate: Date,
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approverName: String,
  approvalComments: String,
  approvedDate: Date,
  // Budget and policy validation
  budgetValidated: {
    type: Boolean,
    default: false,
  },
  policyCompliant: {
    type: Boolean,
    default: false,
  },
  policyViolations: [{
    field: String,
    violation: String,
    justification: String,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

travelRequestSchema.index({ tenantId: 1, employeeId: 1 });
travelRequestSchema.index({ tenantId: 1, status: 1 });
travelRequestSchema.index({ tenantId: 1, approverId: 1, status: 1 });
travelRequestSchema.index({ tenantId: 1, departureDate: 1 });

travelRequestSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('TravelRequest', travelRequestSchema);
