const mongoose = require('mongoose');

/**
 * Document Verification Model
 * BRD Requirement: BR-ONB-004, BR-ONB-005, BR-ONB-006
 * Document verification with UIDAI, PAN, and DigiLocker integration
 */
const documentVerificationSchema = new mongoose.Schema({
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
  // Aadhaar verification (UIDAI)
  aadhaar: {
    number: {
      type: String,
      required: true,
      match: /^[0-9]{12}$/,
    },
    status: {
      type: String,
      enum: ['Pending', 'Verified', 'Failed', 'Discrepancy'],
      default: 'Pending',
    },
    verifiedDate: Date,
    verificationMethod: {
      type: String,
      enum: ['UIDAI API', 'Manual', 'DigiLocker'],
    },
    uidaiResponse: mongoose.Schema.Types.Mixed,
    nameMatch: Boolean,
    dobMatch: Boolean,
    genderMatch: Boolean,
    addressMatch: Boolean,
    photoUrl: String,
    remarks: String,
  },
  // PAN verification (Income Tax API)
  pan: {
    number: {
      type: String,
      required: true,
      match: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
      uppercase: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Verified', 'Failed', 'Discrepancy'],
      default: 'Pending',
    },
    verifiedDate: Date,
    verificationMethod: {
      type: String,
      enum: ['Income Tax API', 'Manual', 'DigiLocker'],
    },
    itResponse: mongoose.Schema.Types.Mixed,
    nameMatch: Boolean,
    dobMatch: Boolean,
    remarks: String,
  },
  // DigiLocker integration
  digiLocker: {
    enabled: {
      type: Boolean,
      default: false,
    },
    consentGiven: {
      type: Boolean,
      default: false,
    },
    consentDate: Date,
    documentsFetched: [{
      documentType: String,
      documentNumber: String,
      fetchedDate: Date,
      url: String,
      verified: Boolean,
    }],
  },
  // Other documents
  documents: [{
    type: {
      type: String,
      enum: ['Photo', 'Educational Certificate', 'Address Proof', 'Experience Certificate', 'Other'],
      required: true,
    },
    name: String,
    url: String,
    uploadedDate: Date,
    verified: {
      type: Boolean,
      default: false,
    },
    verifiedDate: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verificationMethod: {
      type: String,
      enum: ['Manual', 'OCR', 'DigiLocker', 'API'],
    },
    ocrData: mongoose.Schema.Types.Mixed, // Extracted data from OCR
    remarks: String,
  }],
  // Overall verification status
  overallStatus: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Failed', 'Discrepancy'],
    default: 'Pending',
  },
  completedDate: Date,
  verifiedBy: {
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

documentVerificationSchema.index({ tenantId: 1, candidateId: 1 }, { unique: true });
documentVerificationSchema.index({ tenantId: 1, 'aadhaar.number': 1 });
documentVerificationSchema.index({ tenantId: 1, 'pan.number': 1 });
documentVerificationSchema.index({ tenantId: 1, overallStatus: 1 });

documentVerificationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Calculate overall status
  const aadhaarStatus = this.aadhaar.status;
  const panStatus = this.pan.status;
  const documentsVerified = this.documents.every(doc => doc.verified);
  
  if (aadhaarStatus === 'Verified' && panStatus === 'Verified' && documentsVerified) {
    this.overallStatus = 'Completed';
    if (!this.completedDate) {
      this.completedDate = Date.now();
    }
  } else if (aadhaarStatus === 'Failed' || panStatus === 'Failed') {
    this.overallStatus = 'Failed';
  } else if (aadhaarStatus === 'Discrepancy' || panStatus === 'Discrepancy') {
    this.overallStatus = 'Discrepancy';
  } else if (aadhaarStatus !== 'Pending' || panStatus !== 'Pending' || this.documents.length > 0) {
    this.overallStatus = 'In Progress';
  }
  
  next();
});

module.exports = mongoose.model('DocumentVerification', documentVerificationSchema);
