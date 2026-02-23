const mongoose = require('mongoose');

/**
 * Transfer Request Model
 * BRD: BR-P2-003 - Transfer Management Complete Workflow
 */
const transferRequestSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  transferId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    comment: 'Auto-generated: TRF-YYYY-XXXXX',
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  transferType: {
    type: String,
    enum: ['INTER_BRANCH', 'INTER_ZONE', 'PROMOTION_WITH_TRANSFER', 'MUTUAL', 'ADMINISTRATIVE', 'COMPASSIONATE', 'HARDSHIP'],
    required: true,
  },
  initiatedBy: {
    type: String,
    enum: ['EMPLOYEE', 'MANAGEMENT'],
    required: true,
  },
  initiatedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // Current location details
  currentLocation: {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationUnit',
    },
    location: String,
    department: String,
    designation: String,
  },
  // Requested destination
  requestedLocation: {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationUnit',
    },
    location: String,
    department: String,
    designation: String,
  },
  // Final approved destination
  approvedLocation: {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationUnit',
    },
    location: String,
    department: String,
    designation: String,
    reportingManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  supportingDocuments: [{
    name: String,
    url: String,
    uploadedDate: { type: Date, default: Date.now },
  }],
  status: {
    type: String,
    enum: [
      'DRAFT',
      'SUBMITTED',
      'CURRENT_MANAGER_PENDING',
      'CURRENT_MANAGER_APPROVED',
      'CURRENT_MANAGER_REJECTED',
      'DESTINATION_MANAGER_PENDING',
      'DESTINATION_MANAGER_APPROVED',
      'DESTINATION_MANAGER_REJECTED',
      'HR_VERIFICATION_PENDING',
      'HR_VERIFIED',
      'TRANSFER_ORDER_GENERATED',
      'RELIEVING_PENDING',
      'RELIEVED',
      'JOINING_PENDING',
      'JOINED',
      'COMPLETED',
      'CANCELLED',
      'REJECTED',
    ],
    default: 'DRAFT',
    index: true,
  },
  // Workflow approvals
  currentManagerApproval: {
    status: String,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedDate: Date,
    recommendation: String,
    rejectionReason: String,
  },
  destinationManagerApproval: {
    status: String,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedDate: Date,
    acceptance: String,
    rejectionReason: String,
  },
  hrVerification: {
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verifiedDate: Date,
    availabilityConfirmed: Boolean,
    remarks: String,
  },
  // Transfer dates
  requestedRelievingDate: {
    type: Date,
  },
  requestedJoiningDate: {
    type: Date,
  },
  approvedRelievingDate: {
    type: Date,
  },
  approvedJoiningDate: {
    type: Date,
  },
  actualRelievingDate: {
    type: Date,
  },
  actualJoiningDate: {
    type: Date,
  },
  // Transfer order
  transferOrder: {
    orderNumber: String,
    orderDate: Date,
    orderUrl: String,
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  // Salary impact
  salaryImpact: {
    currentSalary: Number,
    newSalary: Number,
    allowanceChanges: [{
      type: String,
      currentAmount: Number,
      newAmount: Number,
    }],
  },
  relocationBenefits: {
    provided: Boolean,
    amount: Number,
    details: String,
  },
  // Asset transfer
  assetTransfer: {
    required: Boolean,
    assetsToReturn: [{
      assetId: String,
      assetName: String,
      status: String,
    }],
    assetsToAllocate: [{
      assetId: String,
      assetName: String,
      status: String,
    }],
  },
  // Mutual transfer (if applicable)
  mutualTransfer: {
    isMutual: Boolean,
    partnerEmployeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    partnerTransferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TransferRequest',
    },
  },
  submittedDate: {
    type: Date,
  },
  completedDate: {
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

transferRequestSchema.index({ tenantId: 1, employeeId: 1, status: 1 });
transferRequestSchema.index({ tenantId: 1, status: 1 });
transferRequestSchema.index({ tenantId: 1, transferType: 1 });

transferRequestSchema.pre('save', async function (next) {
  this.updatedAt = Date.now();
  
  // Generate transfer ID if new
  if (this.isNew && !this.transferId) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('TransferRequest').countDocuments({
      tenantId: this.tenantId,
      transferId: new RegExp(`^TRF-${year}-`),
    });
    this.transferId = `TRF-${year}-${String(count + 1).padStart(5, '0')}`;
  }
  
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('TransferRequest', transferRequestSchema);
