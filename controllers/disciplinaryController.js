const DisciplinaryRecord = require('../models/DisciplinaryRecord');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/notificationService');

/** GET all disciplinary records */
exports.getDisciplinaryRecords = async (req, res) => {
    try {
        const { employeeId, type, status } = req.query;
        const filter = { tenantId: req.tenantId };
        if (employeeId) filter.employeeId = employeeId;
        if (type) filter.type = type;
        if (status) filter.status = status;

        // Employee sees only their own records
        if (req.user.role === 'Employee') {
            const emp = await Employee.findOne({ email: req.user.email, tenantId: req.tenantId });
            if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
            filter.employeeId = emp._id;
        }

        const records = await DisciplinaryRecord.find(filter)
            .populate('employeeId', 'firstName lastName employeeCode department designation')
            .populate('issuedById', 'name email')
            .populate('hrAcknowledgedBy', 'name email')
            .sort({ issuedDate: -1 });

        res.json({ success: true, count: records.length, data: records });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** GET single disciplinary record */
exports.getDisciplinaryRecord = async (req, res) => {
    try {
        const record = await DisciplinaryRecord.findOne({ _id: req.params.id, tenantId: req.tenantId })
            .populate('employeeId', 'firstName lastName employeeCode department designation email')
            .populate('issuedById', 'name email')
            .populate('hrAcknowledgedBy', 'name email')
            .populate('escalatedTo', 'name email');

        if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
        res.json({ success: true, data: record });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** CREATE disciplinary record */
exports.createDisciplinaryRecord = async (req, res) => {
    try {
        const {
            employeeId, type, incidentDate, description, reason,
            suspensionFromDate, suspensionToDate, documentUrl, remarks,
        } = req.body;

        if (!employeeId || !type || !incidentDate || !description || !reason) {
            return res.status(400).json({ success: false, message: 'Required fields missing' });
        }

        const employee = await Employee.findOne({ _id: employeeId, tenantId: req.tenantId });
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        const record = await DisciplinaryRecord.create({
            tenantId: req.tenantId,
            employeeId,
            type,
            incidentDate: new Date(incidentDate),
            issuedDate: new Date(),
            description,
            reason,
            suspensionFromDate: suspensionFromDate ? new Date(suspensionFromDate) : undefined,
            suspensionToDate: suspensionToDate ? new Date(suspensionToDate) : undefined,
            documentUrl,
            remarks,
            issuedById: req.user._id || req.user.id,
            issuedByName: req.user.name || req.user.email,
            status: 'Issued',
        });

        // Notify employee
        if (employee.email) {
            await sendNotification({
                to: employee.email,
                channels: ['email'],
                subject: `Disciplinary Notice: ${type}`,
                message: `A ${type} has been issued to you. Please check HR portal for details. Reason: ${reason}`,
                tenantId: req.tenantId,
                userId: req.user._id,
                module: 'Disciplinary',
                action: type,
            }).catch(() => { });
        }

        await AuditLog.create({
            tenantId: req.tenantId,
            userId: req.user._id || req.user.id,
            userName: req.user.name || req.user.email,
            userEmail: req.user.email,
            action: 'Create',
            module: 'Disciplinary',
            details: JSON.stringify({ type, employeeId, reason }),
        });

        res.status(201).json({ success: true, data: record });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Employee submits response */
exports.submitEmployeeResponse = async (req, res) => {
    try {
        const { response } = req.body;
        const emp = await Employee.findOne({ email: req.user.email, tenantId: req.tenantId });
        if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

        const record = await DisciplinaryRecord.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
            employeeId: emp._id,
            status: 'Issued',
        });
        if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

        record.employeeResponse = response;
        record.employeeResponseDate = new Date();
        record.status = 'Acknowledged';
        await record.save();

        res.json({ success: true, data: record, message: 'Response submitted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** HR closes / updates outcome */
exports.updateDisciplinaryOutcome = async (req, res) => {
    try {
        const { outcome, remarks, status } = req.body;

        const record = await DisciplinaryRecord.findOne({ _id: req.params.id, tenantId: req.tenantId });
        if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

        if (outcome) record.outcome = outcome;
        if (remarks) record.remarks = remarks;
        if (status) record.status = status;
        record.hrAcknowledgedBy = req.user._id || req.user.id;
        record.hrAcknowledgedDate = new Date();
        await record.save();

        res.json({ success: true, data: record, message: 'Outcome updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** GET disciplinary summary for an employee */
exports.getEmployeeDisciplinarySummary = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const total = await DisciplinaryRecord.countDocuments({ tenantId: req.tenantId, employeeId });
        const byType = await DisciplinaryRecord.aggregate([
            { $match: { tenantId: req.tenantId, employeeId: require('mongoose').Types.ObjectId(employeeId) } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
        ]);
        const recent = await DisciplinaryRecord.find({ tenantId: req.tenantId, employeeId })
            .sort({ issuedDate: -1 }).limit(5)
            .populate('issuedById', 'name');

        res.json({ success: true, data: { total, byType, recent } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
