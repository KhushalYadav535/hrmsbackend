const mongoose = require('mongoose');

/**
 * Background Verification Model
 * BRD Requirement: BR-ONB-003
 * Background verification tracking and integration with BGV agencies
 */
const backgroundVerificationSchema = new mongoose.Schema({
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
  // Verification agency details
  agencyId: {
    type: String,
  },
  agencyName: {
    type: String,
  },
  agencyApiKey: String, // For API integration
  // Verification components
  verificationComponents: {
    identity: {
      status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Verified', 'Failed', 'Discrepancy'],
        default: 'Pending',
      },
      verifiedDate: Date,
      remarks: String,
    },
    address: {
      status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Verified', 'Failed', 'Discrepancy'],
        default: 'Pending',
      },
      verifiedDate: Date,
      remarks: String,
    },
    education: {
      status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Verified', 'Failed', 'Discrepancy'],
        default: 'Pending',
      },
      verifiedDate: Date,
      remarks: String,
      institutions: [{
        name: String,
        degree: String,
        year: Number,
        status: String,
        remarks: String,
      }],
    },
    employment: {
      status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Verified', 'Failed', 'Discrepancy'],
        default: 'Pending',
      },
      verifiedDate: Date,
      remarks: String,
      employers: [{
        name: String,
        designation: String,
        period: String,
        status: String,
        remarks: String,
      }],
    },
    criminal: {
      status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Clear', 'Failed', 'Discrepancy'],
        default: 'Pending',
      },
      verifiedDate: Date,
      remarks: String,
    },
    reference: {
      status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Verified', 'Failed', 'Discrepancy'],
        default: 'Pending',
      },
      verifiedDate: Date,
      remarks: String,
      references: [{
        name: String,
        designation: String,
        organization: String,
        contact: String,
        status: String,
        remarks: String,
      }],
    },
  },
  // Overall status
  overallStatus: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Failed', 'Discrepancy'],
    default: 'Pending',
  },
  initiatedDate: {
    type: Date,
    default: Date.now,
  },
  completedDate: Date,
  // Report
  reportUrl: String,
  reportGeneratedDate: Date,
  // Discrepancies
  discrepancies: [{
    component: String,
    description: String,
    severity: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
    },
    resolved: {
      type: Boolean,
      default: false,
    },
    resolutionNotes: String,
  }],
  // Approval
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedDate: Date,
  approvalStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
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

backgroundVerificationSchema.index({ tenantId: 1, candidateId: 1 }, { unique: true });
backgroundVerificationSchema.index({ tenantId: 1, overallStatus: 1 });

backgroundVerificationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Calculate overall status based on component statuses
  const components = this.verificationComponents;
  const statuses = [
    components.identity.status,
    components.address.status,
    components.education.status,
    components.employment.status,
    components.criminal.status,
    components.reference.status,
  ];
  
  if (statuses.every(s => s === 'Verified' || s === 'Clear')) {
    this.overallStatus = 'Completed';
    if (!this.completedDate) {
      this.completedDate = Date.now();
    }
  } else if (statuses.some(s => s === 'Failed')) {
    this.overallStatus = 'Failed';
  } else if (statuses.some(s => s === 'Discrepancy')) {
    this.overallStatus = 'Discrepancy';
  } else if (statuses.some(s => s === 'In Progress' || s === 'Verified' || s === 'Clear')) {
    this.overallStatus = 'In Progress';
  }
  
  next();
});

module.exports = mongoose.model('BackgroundVerification', backgroundVerificationSchema);
