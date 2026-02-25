const AppraisalDispute = require('../models/AppraisalDispute');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/notificationService');

/** Employee submits a dispute */
exports.submitDispute = async (req, res) => {
    try {
        const { appraisalCycleId, disputeType, originalRating, requestedRating, reason, evidenceDescription, evidenceUrls } = req.body;

        const employee = await Employee.findOne({ email: req.user.email, tenantId: req.tenantId });
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        // One dispute per cycle per type
        const existing = await AppraisalDispute.findOne({
            tenantId: req.tenantId, employeeId: employee._id, appraisalCycleId, disputeType,
            status: { $nin: ['Resolved', 'Rejected'] },
        });
        if (existing) return res.status(400).json({ success: false, message: 'A dispute for this cycle and type is already open' });

        const dispute = await AppraisalDispute.create({
            tenantId: req.tenantId,
            employeeId: employee._id,
            appraisalCycleId,
            disputeType,
            originalRating,
            requestedRating,
            reason,
            evidenceDescription,
            evidenceUrls: evidenceUrls || [],
            status: 'Submitted',
            submittedDate: new Date(),
        });

        res.status(201).json({ success: true, data: dispute, message: 'Dispute submitted. Your manager will be notified.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** GET disputes (employee sees own, HR/Manager sees all) */
exports.getDisputes = async (req, res) => {
    try {
        const { status, appraisalCycleId, employeeId } = req.query;
        const filter = { tenantId: req.tenantId };
        if (status) filter.status = status;
        if (appraisalCycleId) filter.appraisalCycleId = appraisalCycleId;

        if (req.user.role === 'Employee') {
            const emp = await Employee.findOne({ email: req.user.email, tenantId: req.tenantId });
            if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
            filter.employeeId = emp._id;
        } else if (employeeId) {
            filter.employeeId = employeeId;
        }

        const disputes = await AppraisalDispute.find(filter)
            .populate('employeeId', 'firstName lastName employeeCode department designation')
            .populate('appraisalCycleId', 'cycleName year')
            .populate('managerId hrReviewedBy', 'name email')
            .sort({ submittedDate: -1 });

        res.json({ success: true, count: disputes.length, data: disputes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** GET single dispute */
exports.getDispute = async (req, res) => {
    try {
        const dispute = await AppraisalDispute.findOne({ _id: req.params.id, tenantId: req.tenantId })
            .populate('employeeId', 'firstName lastName employeeCode department designation')
            .populate('appraisalCycleId', 'cycleName year')
            .populate('managerId hrReviewedBy', 'name email');

        if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

        // Employee can only view their own
        if (req.user.role === 'Employee' && dispute.employeeId.email !== req.user.email) {
            const emp = await Employee.findOne({ email: req.user.email, tenantId: req.tenantId });
            if (!emp || emp._id.toString() !== dispute.employeeId._id.toString()) {
                return res.status(403).json({ success: false, message: 'Not authorized' });
            }
        }

        res.json({ success: true, data: dispute });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Manager responds to dispute */
exports.managerRespond = async (req, res) => {
    try {
        const { response, decision, revisedRating } = req.body; // decision: Accepted/Partially Accepted/Rejected

        const dispute = await AppraisalDispute.findOne({
            _id: req.params.id, tenantId: req.tenantId, status: { $in: ['Submitted', 'Under Review'] },
        }).populate('employeeId', 'firstName lastName email');

        if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found or already processed' });

        dispute.managerResponse = response;
        dispute.managerResponseDate = new Date();
        dispute.managerId = req.user._id || req.user.id;
        dispute.managerDecision = decision;
        dispute.revisedRating = revisedRating;
        dispute.status = 'Manager Responded';

        if (decision === 'Accepted' || decision === 'Partially Accepted') {
            dispute.finalRating = revisedRating || dispute.requestedRating;
        }

        await dispute.save();

        // Notify employee
        if (dispute.employeeId?.email) {
            await sendNotification({
                to: dispute.employeeId.email,
                channels: ['email'],
                subject: `Appraisal Dispute Update - Manager Responded`,
                message: `Your manager has responded to your appraisal dispute (Type: ${dispute.disputeType}). Decision: ${decision}. ${revisedRating ? `Revised rating: ${revisedRating}` : ''} Login to view full response.`,
                tenantId: req.tenantId,
                userId: req.user._id,
                module: 'Appraisal',
                action: 'Dispute Manager Response',
            }).catch(() => { });
        }

        res.json({ success: true, data: dispute, message: 'Response submitted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Employee escalates to HR */
exports.escalateToHR = async (req, res) => {
    try {
        const { reason } = req.body;
        const emp = await Employee.findOne({ email: req.user.email, tenantId: req.tenantId });

        const dispute = await AppraisalDispute.findOne({
            _id: req.params.id, tenantId: req.tenantId,
            employeeId: emp?._id, status: 'Manager Responded',
        });
        if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found or cannot be escalated' });

        dispute.escalatedToHR = true;
        dispute.escalationDate = new Date();
        dispute.escalationReason = reason;
        dispute.status = 'Escalated to HR';
        await dispute.save();

        res.json({ success: true, data: dispute, message: 'Dispute escalated to HR' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** HR reviews escalated dispute */
exports.hrReview = async (req, res) => {
    try {
        const { decision, comments, finalRating } = req.body;

        const dispute = await AppraisalDispute.findOne({
            _id: req.params.id, tenantId: req.tenantId, status: 'Escalated to HR',
        }).populate('employeeId', 'firstName lastName email');

        if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

        dispute.hrReviewedBy = req.user._id || req.user.id;
        dispute.hrReviewDate = new Date();
        dispute.hrDecision = decision;
        dispute.hrComments = comments;
        dispute.finalRating = finalRating || dispute.revisedRating;
        dispute.status = 'HR Reviewed';
        dispute.resolvedDate = new Date();
        dispute.resolutionSummary = `HR Decision: ${decision}. ${comments || ''}`;
        await dispute.save();

        // Notify employee
        if (dispute.employeeId?.email) {
            await sendNotification({
                to: dispute.employeeId.email,
                channels: ['email'],
                subject: 'Appraisal Dispute Resolved by HR',
                message: `HR has reviewed your appraisal dispute. Final Decision: ${decision}. ${finalRating ? `Final rating: ${finalRating}` : ''} Please login to view details.`,
                tenantId: req.tenantId,
                userId: req.user._id,
                module: 'Appraisal',
                action: 'Dispute HR Resolved',
            }).catch(() => { });
        }

        res.json({ success: true, data: dispute, message: 'HR review completed' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
