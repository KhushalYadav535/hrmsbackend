const mongoose = require('mongoose');

/**
 * Disciplinary Record Model
 * BRD Requirement: Employee disciplinary management — warnings, memos, suspension records
 */
const disciplinaryRecordSchema = new mongoose.Schema({
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
    type: {
        type: String,
        required: true,
        enum: ['Verbal Warning', 'Written Warning', 'Show Cause Notice', 'Memo', 'Suspension', 'Termination', 'Other'],
    },
    incidentDate: {
        type: Date,
        required: true,
    },
    issuedDate: {
        type: Date,
        required: true,
        default: Date.now,
    },
    description: {
        type: String,
        required: true,
        trim: true,
    },
    reason: {
        type: String,
        required: true,
        trim: true,
    },
    // For suspension: duration
    suspensionFromDate: Date,
    suspensionToDate: Date,
    // Employee response
    employeeResponse: {
        type: String,
        trim: true,
    },
    employeeResponseDate: Date,
    // Outcome
    outcome: {
        type: String,
        enum: ['Pending', 'Warning Acknowledged', 'Resolved', 'Escalated', 'Dismissed', 'Terminated'],
        default: 'Pending',
    },
    // Issued by
    issuedById: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    issuedByName: {
        type: String,
        required: true,
    },
    // HR acknowledgment
    hrAcknowledgedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    hrAcknowledgedDate: Date,
    // Document
    documentUrl: String,
    // Escalation
    escalatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    escalatedDate: Date,
    escalationReason: String,
    // Status
    status: {
        type: String,
        enum: ['Draft', 'Issued', 'Acknowledged', 'Closed'],
        default: 'Issued',
    },
    remarks: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

disciplinaryRecordSchema.index({ tenantId: 1, employeeId: 1 });
disciplinaryRecordSchema.index({ tenantId: 1, type: 1, status: 1 });

disciplinaryRecordSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('DisciplinaryRecord', disciplinaryRecordSchema);
