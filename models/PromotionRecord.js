const mongoose = require('mongoose');

/**
 * Promotion Record Model
 * BRD Requirement: Promotion management workflows with effective date and letter generation
 */
const promotionRecordSchema = new mongoose.Schema({
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
    promotionType: {
        type: String,
        enum: ['Merit', 'Seniority', 'Performance-Based', 'Cross-Functional', 'Acting', 'Other'],
        required: true,
    },
    // Before promotion
    previousDesignation: { type: String, required: true },
    previousGrade: { type: String },
    previousSalary: { type: Number },
    previousDepartment: { type: String },
    // After promotion
    newDesignation: { type: String, required: true },
    newGrade: { type: String },
    newSalary: { type: Number },
    newDepartment: { type: String },
    salaryIncrement: { type: Number, default: 0 },
    incrementPercentage: { type: Number, default: 0 },
    // Dates
    effectiveDate: {
        type: Date,
        required: true,
    },
    announcementDate: {
        type: Date,
        default: Date.now,
    },
    // Approval workflow
    status: {
        type: String,
        enum: ['Draft', 'Pending HR', 'Pending Management', 'Approved', 'Rejected', 'Cancelled'],
        default: 'Pending HR',
    },
    hrRecommendedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    hrRecommendedDate: Date,
    managementApprovedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    managementApprovalDate: Date,
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    rejectionReason: String,
    // Basis
    appraisalRating: { type: Number },
    appraisalCycleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AppraisalCycle',
    },
    justification: { type: String, required: true },
    // Letter
    letterGenerated: { type: Boolean, default: false },
    letterGeneratedDate: Date,
    letterUrl: String,
    letterAcknowledgedDate: Date,
    // Payroll integration
    payrollUpdated: { type: Boolean, default: false },
    payrollUpdateDate: Date,
    remarks: String,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

promotionRecordSchema.index({ tenantId: 1, employeeId: 1, effectiveDate: -1 });
promotionRecordSchema.index({ tenantId: 1, status: 1 });

promotionRecordSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    if (this.previousSalary && this.newSalary) {
        this.salaryIncrement = this.newSalary - this.previousSalary;
        this.incrementPercentage = this.previousSalary > 0
            ? parseFloat(((this.salaryIncrement / this.previousSalary) * 100).toFixed(2))
            : 0;
    }
    next();
});

module.exports = mongoose.model('PromotionRecord', promotionRecordSchema);
