const mongoose = require('mongoose');

/**
 * AppraisalDispute Model
 * BRD Requirement: Employee can challenge rating -> HR/Manager review -> escalation
 */
const appraisalDisputeSchema = new mongoose.Schema({
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
    appraisalCycleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AppraisalCycle',
        required: true,
        index: true,
    },
    // What is being disputed
    disputeType: {
        type: String,
        enum: ['Overall Rating', 'Goal Score', 'Competency Rating', 'KPI Achievement', 'Other'],
        required: true,
    },
    // Original - Disputed
    originalRating: { type: Number },
    requestedRating: { type: Number },
    // Description
    reason: {
        type: String,
        required: true,
        trim: true,
    },
    evidenceDescription: {
        type: String,
        trim: true,
    },
    evidenceUrls: [String],
    // Workflow
    status: {
        type: String,
        enum: ['Submitted', 'Under Review', 'Manager Responded', 'Escalated to HR', 'HR Reviewed', 'Resolved', 'Rejected'],
        default: 'Submitted',
    },
    submittedDate: { type: Date, default: Date.now },
    // Manager response
    managerResponse: { type: String, trim: true },
    managerResponseDate: Date,
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    managerDecision: { type: String, enum: ['Accepted', 'Partially Accepted', 'Rejected'] },
    revisedRating: { type: Number },
    // HR Escalation
    escalatedToHR: { type: Boolean, default: false },
    escalationDate: Date,
    escalationReason: { type: String, trim: true },
    hrReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hrReviewDate: Date,
    hrDecision: { type: String, enum: ['Accepted', 'Partially Accepted', 'Rejected'] },
    hrComments: { type: String, trim: true },
    finalRating: { type: Number },
    // Resolution
    resolvedDate: Date,
    resolutionSummary: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

appraisalDisputeSchema.index({ tenantId: 1, employeeId: 1, appraisalCycleId: 1 });
appraisalDisputeSchema.index({ tenantId: 1, status: 1 });

appraisalDisputeSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('AppraisalDispute', appraisalDisputeSchema);
