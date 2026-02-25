const PromotionRecord = require('../models/PromotionRecord');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/notificationService');

/** GET all promotion records */
exports.getPromotions = async (req, res) => {
    try {
        const { employeeId, status, fromDate, toDate } = req.query;
        const filter = { tenantId: req.tenantId };
        if (employeeId) filter.employeeId = employeeId;
        if (status) filter.status = status;
        if (fromDate || toDate) {
            filter.effectiveDate = {};
            if (fromDate) filter.effectiveDate.$gte = new Date(fromDate);
            if (toDate) filter.effectiveDate.$lte = new Date(toDate);
        }

        const records = await PromotionRecord.find(filter)
            .populate('employeeId', 'firstName lastName employeeCode department designation')
            .populate('hrRecommendedBy', 'name email')
            .populate('managementApprovedBy', 'name email')
            .populate('createdBy', 'name email')
            .sort({ effectiveDate: -1 });

        res.json({ success: true, count: records.length, data: records });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** GET single promotion */
exports.getPromotion = async (req, res) => {
    try {
        const record = await PromotionRecord.findOne({ _id: req.params.id, tenantId: req.tenantId })
            .populate('employeeId', 'firstName lastName employeeCode department designation email')
            .populate('hrRecommendedBy managementApprovedBy rejectedBy createdBy', 'name email');

        if (!record) return res.status(404).json({ success: false, message: 'Promotion record not found' });
        res.json({ success: true, data: record });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** CREATE promotion recommendation (HR) */
exports.createPromotion = async (req, res) => {
    try {
        const {
            employeeId, promotionType,
            previousDesignation, previousGrade, previousSalary, previousDepartment,
            newDesignation, newGrade, newSalary, newDepartment,
            effectiveDate, justification, appraisalRating, appraisalCycleId,
        } = req.body;

        if (!employeeId || !promotionType || !newDesignation || !effectiveDate || !justification) {
            return res.status(400).json({ success: false, message: 'Required fields missing' });
        }

        const employee = await Employee.findOne({ _id: employeeId, tenantId: req.tenantId });
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        const promotion = await PromotionRecord.create({
            tenantId: req.tenantId,
            employeeId,
            promotionType,
            previousDesignation: previousDesignation || employee.designation,
            previousGrade: previousGrade || employee.grade,
            previousSalary,
            previousDepartment: previousDepartment || employee.department,
            newDesignation,
            newGrade,
            newSalary,
            newDepartment: newDepartment || employee.department,
            effectiveDate: new Date(effectiveDate),
            justification,
            appraisalRating,
            appraisalCycleId,
            hrRecommendedBy: req.user._id || req.user.id,
            hrRecommendedDate: new Date(),
            status: 'Pending Management',
            createdBy: req.user._id || req.user.id,
        });

        await AuditLog.create({
            tenantId: req.tenantId,
            userId: req.user._id || req.user.id,
            userName: req.user.name || req.user.email,
            userEmail: req.user.email,
            action: 'Create',
            module: 'Promotions',
            details: JSON.stringify({ employeeId, newDesignation, effectiveDate }),
        });

        res.status(201).json({ success: true, data: promotion });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** APPROVE promotion (Management) */
exports.approvePromotion = async (req, res) => {
    try {
        const { comments } = req.body;
        const promotion = await PromotionRecord.findOne({
            _id: req.params.id, tenantId: req.tenantId,
            status: { $in: ['Pending HR', 'Pending Management'] },
        }).populate('employeeId', 'firstName lastName email');

        if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found or already processed' });

        promotion.status = 'Approved';
        promotion.managementApprovedBy = req.user._id || req.user.id;
        promotion.managementApprovalDate = new Date();
        if (comments) promotion.remarks = comments;
        await promotion.save();

        // Update employee record if effective date is today or past
        if (new Date(promotion.effectiveDate) <= new Date()) {
            await Employee.findByIdAndUpdate(promotion.employeeId._id, {
                designation: promotion.newDesignation,
                ...(promotion.newGrade && { grade: promotion.newGrade }),
                ...(promotion.newDepartment && { department: promotion.newDepartment }),
            });
            promotion.payrollUpdated = true;
            await promotion.save();
        }

        // Notify employee
        if (promotion.employeeId?.email) {
            await sendNotification({
                to: promotion.employeeId.email,
                channels: ['email'],
                subject: 'Congratulations! Promotion Approved',
                message: `We are pleased to inform you that your promotion to ${promotion.newDesignation} has been approved, effective ${new Date(promotion.effectiveDate).toLocaleDateString('en-IN')}. Congratulations!`,
                tenantId: req.tenantId,
                userId: req.user._id,
                module: 'Promotions',
                action: 'Promotion Approved',
            }).catch(() => { });
        }

        res.json({ success: true, data: promotion, message: 'Promotion approved' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** REJECT promotion */
exports.rejectPromotion = async (req, res) => {
    try {
        const { reason } = req.body;
        const promotion = await PromotionRecord.findOne({
            _id: req.params.id, tenantId: req.tenantId,
            status: { $in: ['Pending HR', 'Pending Management'] },
        });
        if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found' });

        promotion.status = 'Rejected';
        promotion.rejectedBy = req.user._id || req.user.id;
        promotion.rejectionReason = reason;
        await promotion.save();

        res.json({ success: true, data: promotion, message: 'Promotion rejected' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Generate promotion letter */
exports.generatePromotionLetter = async (req, res) => {
    try {
        const promotion = await PromotionRecord.findOne({
            _id: req.params.id, tenantId: req.tenantId, status: 'Approved',
        }).populate('employeeId', 'firstName lastName employeeCode department designation');

        if (!promotion) return res.status(404).json({ success: false, message: 'Approved promotion not found' });

        const emp = promotion.employeeId;
        const letterContent = {
            date: new Date().toLocaleDateString('en-IN'),
            employeeName: `${emp.firstName} ${emp.lastName}`,
            employeeCode: emp.employeeCode,
            previousDesignation: promotion.previousDesignation,
            newDesignation: promotion.newDesignation,
            newGrade: promotion.newGrade,
            effectiveDate: new Date(promotion.effectiveDate).toLocaleDateString('en-IN'),
            salaryIncrement: promotion.salaryIncrement,
            newSalary: promotion.newSalary,
        };

        promotion.letterGenerated = true;
        promotion.letterGeneratedDate = new Date();
        await promotion.save();

        res.json({ success: true, data: { promotion, letterContent } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Get employee promotion history */
exports.getEmployeePromotionHistory = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const records = await PromotionRecord.find({ tenantId: req.tenantId, employeeId })
            .sort({ effectiveDate: -1 })
            .populate('hrRecommendedBy managementApprovedBy', 'name');

        res.json({ success: true, count: records.length, data: records });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
