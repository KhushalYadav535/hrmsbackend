const mongoose = require('mongoose');

/**
 * Grievance Model
 * BRD: BR-P1-004 - Grievance Management Module
 */
const grievanceSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  grievanceId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    comment: 'Auto-generated: GRV-YYYY-XXXXX',
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  category: {
    type: String,
    required: true,
    enum: [
      'SALARY_BENEFITS',
      'LEAVE_ATTENDANCE',
      'WORK_ENVIRONMENT',
      'WORKPLACE_HARASSMENT',
      'MANAGER_PEER_ISSUES',
      'TRANSFER_POSTING',
      'TRAINING_DEVELOPMENT',
      'DISCIPLINARY_ACTION',
      'OTHERS',
    ],
    index: true,
  },
  subCategory: {
    type: String,
    trim: true,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  description: {
    type: String,
    required: true,
    minlength: 50,
  },
  incidentDate: {
    type: Date,
  },
  incidentLocation: {
    type: String,
    trim: true,
  },
  witnesses: [{
    name: String,
    employeeCode: String,
    contact: String,
  }],
  documents: [{
    name: String,
    type: String,
    url: String,
    uploadedDate: { type: Date, default: Date.now },
  }],
  preferredResolution: {
    type: String,
    trim: true,
  },
  confidentialityRequired: {
    type: Boolean,
    default: false,
  },
  anonymousSubmission: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: [
      'SUBMITTED',
      'UNDER_REVIEW',
      'ASSIGNED',
      'INVESTIGATION',
      'RESOLUTION_PROPOSED',
      'RESOLVED',
      'CLOSED',
      'REOPENED',
      'APPEALED',
      'REJECTED',
    ],
    default: 'SUBMITTED',
    index: true,
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
    index: true,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  assignedDepartment: {
    type: String,
    trim: true,
  },
  submittedDate: {
    type: Date,
    default: Date.now,
    index: true,
  },
  acknowledgedDate: {
    type: Date,
  },
  assignedDate: {
    type: Date,
  },
  investigationStartDate: {
    type: Date,
  },
  resolutionProposedDate: {
    type: Date,
  },
  resolvedDate: {
    type: Date,
  },
  closedDate: {
    type: Date,
  },
  slaDeadline: {
    type: Date,
    index: true,
  },
  slaStatus: {
    type: String,
    enum: ['ON_TIME', 'AT_RISK', 'BREACHED'],
    default: 'ON_TIME',
  },
  resolution: {
    proposedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    proposedDate: Date,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedDate: Date,
    resolutionDetails: String,
    actionTaken: String,
    implementationDate: Date,
  },
  employeeFeedback: {
    satisfactionRating: {
      type: Number,
      min: 1,
      max: 5,
    },
    feedback: String,
    feedbackDate: Date,
  },
  appeal: {
    appealed: Boolean,
    appealDate: Date,
    appealReason: String,
    appealReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    appealReviewDate: Date,
    appealDecision: String,
    appealDecisionDate: Date,
  },
  escalationHistory: [{
    escalatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    escalatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reason: String,
    escalatedDate: { type: Date, default: Date.now },
  }],
  comments: [{
    commentedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    comment: String,
    isInternal: {
      type: Boolean,
      default: false,
      comment: 'Internal comments not visible to employee',
    },
    commentedDate: { type: Date, default: Date.now },
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

// Generate grievance ID before save
grievanceSchema.pre('save', async function (next) {
  if (this.isNew && !this.grievanceId) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Grievance').countDocuments({
      tenantId: this.tenantId,
      grievanceId: new RegExp(`^GRV-${year}-`),
    });
    this.grievanceId = `GRV-${year}-${String(count + 1).padStart(5, '0')}`;
  }
  
  // Calculate SLA deadline based on severity
  if (this.isNew || this.isModified('severity')) {
    const slaDays = {
      CRITICAL: 7,
      HIGH: 15,
      MEDIUM: 30,
      LOW: 45,
    };
    const days = slaDays[this.severity] || 30;
    this.slaDeadline = new Date(this.submittedDate);
    this.slaDeadline.setDate(this.slaDeadline.getDate() + days);
  }
  
  // Update SLA status
  if (this.slaDeadline && this.status !== 'CLOSED' && this.status !== 'RESOLVED') {
    const now = new Date();
    const daysRemaining = Math.ceil((this.slaDeadline - now) / (1000 * 60 * 60 * 24));
    if (daysRemaining < 0) {
      this.slaStatus = 'BREACHED';
    } else if (daysRemaining <= 3) {
      this.slaStatus = 'AT_RISK';
    } else {
      this.slaStatus = 'ON_TIME';
    }
  }
  
  this.updatedAt = Date.now();
  next();
});

// Indexes
grievanceSchema.index({ tenantId: 1, status: 1 });
grievanceSchema.index({ tenantId: 1, employeeId: 1 });
grievanceSchema.index({ tenantId: 1, assignedTo: 1 });
grievanceSchema.index({ tenantId: 1, category: 1 });
grievanceSchema.index({ tenantId: 1, severity: 1 });
grievanceSchema.index({ tenantId: 1, slaStatus: 1 });

module.exports = mongoose.model('Grievance', grievanceSchema);
