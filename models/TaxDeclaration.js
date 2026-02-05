const mongoose = require('mongoose');

const TaxDeclarationSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  financialYear: {
    type: String,
    required: true,
    enum: ['2023-2024', '2024-2025', '2025-2026', '2026-2027'],
  },
  regime: {
    type: String,
    required: true,
    enum: ['Old', 'New'],
    default: 'New',
  },
  declarations: [
    {
      section: { type: String, required: true }, // e.g., 80C, 80D, HRA
      amount: { type: Number, required: true },
      proofUrl: { type: String }, // URL to uploaded document
      status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending',
      },
      rejectionReason: { type: String },
    },
  ],
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Verified'],
    default: 'Draft',
  },
  submissionDate: {
    type: Date,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  verifiedDate: {
    type: Date,
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

module.exports = mongoose.model('TaxDeclaration', TaxDeclarationSchema);
