const mongoose = require('mongoose');

/**
 * Increment Record Model
 * BRD Requirement: Auto-link appraisal rating → salary increment
 * Increment % based on appraisal rating bands configured per tenant
 */
const incrementPolicySchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true,
    },
    financialYear: { type: String, required: true }, // e.g. "2025-2026"
    // Rating band → increment percentage mapping
    ratingBands: [
        {
            label: { type: String, required: true }, // e.g. "Outstanding", "Exceeds Expectations"
            minRating: { type: Number, required: true }, // >= this
            maxRating: { type: Number, required: true }, // <= this
            incrementPercentage: { type: Number, required: true }, // % of current gross
            minIncrementAmount: { type: Number, default: 0 }, // floor in INR
            maxIncrementAmount: { type: Number, default: 0 }, // ceiling in INR (0 = no cap)
        },
    ],
    // Grade multipliers (e.g. Officers get 1.2x the base %)
    gradeMultipliers: [
        {
            grade: String,
            multiplier: { type: Number, default: 1.0 },
        },
    ],
    effectiveDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

incrementPolicySchema.index({ tenantId: 1, financialYear: 1, isActive: 1 });

incrementPolicySchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

const incrementRecordSchema = new mongoose.Schema({
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
        index: true,
    },
    // Appraisal link
    finalAppraisalRating: { type: Number, required: true }, // e.g. 3.8
    ratingLabel: { type: String }, // e.g. "Exceeds Expectations"
    // Increment details
    financialYear: { type: String, required: true },
    previousGross: { type: Number, required: true },
    incrementPercentage: { type: Number, required: true },
    incrementAmount: { type: Number, required: true },
    newGross: { type: Number, required: true },
    // Breakdown (optional)
    basicIncrease: { type: Number, default: 0 },
    hraIncrease: { type: Number, default: 0 },
    // Status
    status: {
        type: String,
        enum: ['Computed', 'Pending HR', 'Approved', 'Rejected', 'Applied'],
        default: 'Computed',
    },
    effectiveDate: { type: Date, required: true },
    // Approval
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedDate: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String,
    // Letter
    incrementLetterGenerated: { type: Boolean, default: false },
    incrementLetterDate: Date,
    // Payroll applied
    payrollApplied: { type: Boolean, default: false },
    payrollAppliedDate: Date,
    remarks: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

incrementRecordSchema.index({ tenantId: 1, employeeId: 1, financialYear: 1 }, { unique: true });
incrementRecordSchema.index({ tenantId: 1, status: 1 });

incrementRecordSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = {
    IncrementPolicy: mongoose.model('IncrementPolicy', incrementPolicySchema),
    IncrementRecord: mongoose.model('IncrementRecord', incrementRecordSchema),
};
