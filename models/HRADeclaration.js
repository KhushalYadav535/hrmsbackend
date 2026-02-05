const mongoose = require('mongoose');

/**
 * HRA Declaration Model
 * BRD Requirement: BR-TAX-003
 * HRA exemption calculation and declaration
 */
const hraDeclarationSchema = new mongoose.Schema({
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
  // Rent details
  rentDetails: {
    address: String,
    city: String,
    state: String,
    pinCode: String,
    monthlyRent: Number,
    landlordName: String,
    landlordPan: String, // Required if annual rent > ₹1 lakh
    rentReceipts: [String], // URLs to uploaded receipts
  },
  // HRA details from salary
  hraReceived: Number,
  basicSalary: Number,
  isMetro: {
    type: Boolean,
    default: false,
  },
  // Calculated exemption
  calculatedExemption: {
    actualHra: Number,
    percentageOfBasic: Number, // 50% for metro, 40% for non-metro
    rentMinus10PercentBasic: Number,
    exemptionAmount: Number, // Least of the three
  },
  // Month-wise exemption
  monthWiseExemption: [{
    month: String,
    exemption: Number,
    rentPaid: Number,
  }],
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Verified', 'Rejected'],
    default: 'Draft',
  },
  submittedDate: Date,
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  verifiedDate: Date,
  rejectionReason: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

hraDeclarationSchema.index({ tenantId: 1, employeeId: 1, financialYear: 1 }, { unique: true });
hraDeclarationSchema.index({ tenantId: 1, status: 1 });

hraDeclarationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('HRADeclaration', hraDeclarationSchema);
