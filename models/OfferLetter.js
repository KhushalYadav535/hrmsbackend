const mongoose = require('mongoose');

/**
 * Offer Letter Model
 * BRD Requirement: BR-ONB-002, BR-ONB-003
 * Digital offer letter generation and acceptance
 */
const offerLetterSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Onboarding',
    required: true,
    index: true,
  },
  candidateName: {
    type: String,
    required: true,
  },
  candidateEmail: {
    type: String,
    required: true,
  },
  position: {
    type: String,
    required: true,
  },
  department: {
    type: String,
    required: true,
  },
  designation: {
    type: String,
    required: true,
  },
  joiningDate: {
    type: Date,
    required: true,
  },
  // CTC Details
  ctc: {
    annual: { type: Number, required: true },
    monthly: { type: Number, required: true },
    breakup: {
      basicSalary: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      specialAllowance: { type: Number, default: 0 },
      transportAllowance: { type: Number, default: 0 },
      medicalAllowance: { type: Number, default: 0 },
      otherAllowances: { type: Number, default: 0 },
      providentFund: { type: Number, default: 0 },
      gratuity: { type: Number, default: 0 },
      otherBenefits: { type: Number, default: 0 },
    },
  },
  // Probation details
  probationPeriod: {
    duration: { type: Number, default: 6 }, // months
    startDate: Date,
    endDate: Date,
  },
  // Offer letter details
  offerLetterNumber: {
    type: String,
    unique: true,
    sparse: true,
  },
  offerDate: {
    type: Date,
    default: Date.now,
  },
  validityDate: {
    type: Date,
    required: true, // 30 days from offer date
  },
  // Acceptance
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Withdrawn'],
    default: 'Draft',
  },
  acceptedDate: Date,
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  acceptanceIp: String,
  acceptanceSignature: String, // Digital signature
  // Digital signature
  signedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  signedDate: Date,
  digitalSignature: String,
  // Document
  pdfUrl: String,
  templateUsed: String,
  // Terms and conditions
  termsAndConditions: [String],
  specialInstructions: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

offerLetterSchema.index({ tenantId: 1, candidateEmail: 1 });
offerLetterSchema.index({ tenantId: 1, status: 1 });
// Note: offerLetterNumber index is already created by unique: true, so no need for explicit index

offerLetterSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Generate offer letter number if not exists
  if (!this.offerLetterNumber && this.status !== 'Draft') {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.offerLetterNumber = `OFF-${year}-${random}`;
  }
  
  // Set validity date (30 days from offer date)
  if (!this.validityDate && this.offerDate) {
    const validity = new Date(this.offerDate);
    validity.setDate(validity.getDate() + 30);
    this.validityDate = validity;
  }
  
  // Check if expired
  if (this.status === 'Sent' && this.validityDate < new Date()) {
    this.status = 'Expired';
  }
  
  next();
});

module.exports = mongoose.model('OfferLetter', offerLetterSchema);
