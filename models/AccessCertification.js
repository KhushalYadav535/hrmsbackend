const mongoose = require('mongoose');

/**
 * Access Certification Model
 * BRD Requirement: BR-UAM-006
 * Periodic access certification and review
 */
const accessCertificationSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  campaignName: {
    type: String,
    required: true,
  },
  campaignType: {
    type: String,
    enum: ['Quarterly', 'Annual', 'Ad-hoc'],
    required: true,
  },
  // Certification period
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  deadline: {
    type: Date,
    required: true,
  },
  // Certifier (manager)
  certifierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // Users to certify (team members)
  certifications: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    userName: String,
    userEmail: String,
    roles: [String],
    permissions: [String],
    status: {
      type: String,
      enum: ['Pending', 'Certified', 'Changes Requested', 'Overdue'],
      default: 'Pending',
    },
    certifiedDate: Date,
    changesRequested: [{
      type: {
        type: String,
        enum: ['Revoke Role', 'Revoke Permission', 'Add Role', 'Add Permission'],
      },
      role: String,
      permission: String,
      reason: String,
    }],
    comments: String,
  }],
  // Overall campaign status
  status: {
    type: String,
    enum: ['Draft', 'Active', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Draft',
  },
  // Reminders sent
  remindersSent: [{
    type: {
      type: String,
      enum: ['7 Days Before', '3 Days Before', '1 Day Before', 'On Deadline', 'Overdue'],
    },
    sentDate: Date,
  }],
  // Completion
  completedDate: Date,
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // Report
  reportUrl: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

accessCertificationSchema.index({ tenantId: 1, certifierId: 1 });
accessCertificationSchema.index({ tenantId: 1, status: 1 });
accessCertificationSchema.index({ tenantId: 1, deadline: 1 });
accessCertificationSchema.index({ tenantId: 1, 'certifications.userId': 1 });

accessCertificationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Calculate campaign status
  if (this.certifications && this.certifications.length > 0) {
    const allCertified = this.certifications.every(c => c.status === 'Certified');
    const anyPending = this.certifications.some(c => c.status === 'Pending' || c.status === 'Overdue');
    
    if (allCertified) {
      this.status = 'Completed';
      if (!this.completedDate) {
        this.completedDate = Date.now();
      }
    } else if (anyPending && this.status === 'Draft') {
      this.status = 'Active';
    } else if (anyPending) {
      this.status = 'In Progress';
    }
  }
  
  next();
});

module.exports = mongoose.model('AccessCertification', accessCertificationSchema);
