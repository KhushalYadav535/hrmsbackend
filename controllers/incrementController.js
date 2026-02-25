const { IncrementPolicy, IncrementRecord } = require('../models/IncrementRecord');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/notificationService');

/**
 * GET increment policy for a financial year
 */
exports.getIncrementPolicy = async (req, res) => {
    try {
        const { financialYear } = req.query;
        const filter = { tenantId: req.tenantId, isActive: true };
        if (financialYear) filter.financialYear = financialYear;

        const policy = await IncrementPolicy.findOne(filter).sort({ createdAt: -1 });
        res.json({ success: true, data: policy });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * CREATE/UPDATE increment policy (rating bands)
 */
exports.upsertIncrementPolicy = async (req, res) => {
    try {
        const { financialYear, ratingBands, gradeMultipliers, effectiveDate } = req.body;

        if (!financialYear || !ratingBands || !effectiveDate) {
            return res.status(400).json({ success: false, message: 'financialYear, ratingBands, effectiveDate are required' });
        }

        // Deactivate previous active policy for same FY
        await IncrementPolicy.updateMany(
            { tenantId: req.tenantId, financialYear, isActive: true },
            { isActive: false }
        );

        const policy = await IncrementPolicy.create({
            tenantId: req.tenantId,
            financialYear,
            ratingBands,
            gradeMultipliers: gradeMultipliers || [],
            effectiveDate: new Date(effectiveDate),
            isActive: true,
            createdBy: req.user._id || req.user.id,
        });

        res.status(201).json({ success: true, data: policy });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * COMPUTE increments for all employees in an appraisal cycle
 * Auto-links appraisal rating → increment amount using active policy
 */
exports.computeIncrements = async (req, res) => {
    try {
        const { appraisalCycleId, financialYear, effectiveDate } = req.body;

        if (!financialYear || !effectiveDate) {
            return res.status(400).json({ success: false, message: 'financialYear and effectiveDate are required' });
        }

        // Get active policy for this FY
        const policy = await IncrementPolicy.findOne({ tenantId: req.tenantId, financialYear, isActive: true });
        if (!policy) {
            return res.status(404).json({ success: false, message: `No increment policy found for FY ${financialYear}. Please create one first.` });
        }

        // Get finalized appraisal ratings
        const AppraisalRecord = require('../models/AppraisalRecord') || require('../models/Appraisal');
        let appraisals = [];
        try {
            const filter = { tenantId: req.tenantId };
            if (appraisalCycleId) filter.cycleId = appraisalCycleId;
            appraisals = await AppraisalRecord.find({ ...filter, status: { $in: ['Finalized', 'Completed'] } })
                .populate('employeeId', 'firstName lastName employeeCode grade currentSalary grossSalary');
        } catch {
            return res.status(400).json({ success: false, message: 'Could not fetch appraisals. Ensure appraisal records are finalized.' });
        }

        if (appraisals.length === 0) {
            return res.status(404).json({ success: false, message: 'No finalized appraisals found for this cycle' });
        }

        const results = { computed: 0, skipped: 0, errors: [] };

        for (const appraisal of appraisals) {
            try {
                const employee = appraisal.employeeId;
                if (!employee) { results.skipped++; continue; }

                const rating = appraisal.finalRating || appraisal.overallRating;
                if (!rating) { results.skipped++; continue; }

                // Find matching rating band
                const band = policy.ratingBands.find(b => rating >= b.minRating && rating <= b.maxRating);
                if (!band) { results.skipped++; continue; }

                // Apply grade multiplier if configured
                const gradeMultiplier = (policy.gradeMultipliers || []).find(g => g.grade === employee.grade);
                const multiplier = gradeMultiplier?.multiplier || 1.0;
                const effectivePercentage = parseFloat((band.incrementPercentage * multiplier).toFixed(2));

                const currentGross = employee.currentSalary || employee.grossSalary || 0;
                let incrementAmount = Math.round(currentGross * (effectivePercentage / 100));

                // Apply floor/ceiling
                if (band.minIncrementAmount > 0) incrementAmount = Math.max(incrementAmount, band.minIncrementAmount);
                if (band.maxIncrementAmount > 0) incrementAmount = Math.min(incrementAmount, band.maxIncrementAmount);

                const newGross = currentGross + incrementAmount;

                // Upsert increment record
                await IncrementRecord.findOneAndUpdate(
                    { tenantId: req.tenantId, employeeId: employee._id, financialYear },
                    {
                        tenantId: req.tenantId,
                        employeeId: employee._id,
                        appraisalCycleId: appraisalCycleId || appraisal.cycleId,
                        finalAppraisalRating: rating,
                        ratingLabel: band.label,
                        financialYear,
                        previousGross: currentGross,
                        incrementPercentage: effectivePercentage,
                        incrementAmount,
                        newGross,
                        effectiveDate: new Date(effectiveDate),
                        status: 'Computed',
                    },
                    { upsert: true, new: true }
                );

                results.computed++;
            } catch (err) {
                results.errors.push(`${appraisal.employeeId?.employeeCode}: ${err.message}`);
            }
        }

        await AuditLog.create({
            tenantId: req.tenantId,
            userId: req.user._id || req.user.id,
            userName: req.user.name || req.user.email,
            userEmail: req.user.email,
            action: 'Process',
            module: 'Increment',
            details: JSON.stringify({ financialYear, appraisalCycleId, ...results }),
        });

        res.json({ success: true, data: results, message: `Increments computed: ${results.computed}, skipped: ${results.skipped}` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET all increment records
 */
exports.getIncrementRecords = async (req, res) => {
    try {
        const { financialYear, status, employeeId } = req.query;
        const filter = { tenantId: req.tenantId };
        if (financialYear) filter.financialYear = financialYear;
        if (status) filter.status = status;
        if (employeeId) filter.employeeId = employeeId;

        const records = await IncrementRecord.find(filter)
            .populate('employeeId', 'firstName lastName employeeCode department designation grade')
            .populate('approvedBy', 'name')
            .sort({ createdAt: -1 });

        const summary = {
            total: records.length,
            totalIncrementAmount: records.reduce((sum, r) => sum + (r.incrementAmount || 0), 0),
            avgIncrementPercentage: records.length
                ? parseFloat((records.reduce((s, r) => s + r.incrementPercentage, 0) / records.length).toFixed(2))
                : 0,
        };

        res.json({ success: true, data: records, summary });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * APPROVE increment record
 */
exports.approveIncrement = async (req, res) => {
    try {
        const record = await IncrementRecord.findOne({
            _id: req.params.id, tenantId: req.tenantId,
            status: { $in: ['Computed', 'Pending HR'] },
        }).populate('employeeId', 'firstName lastName email');

        if (!record) return res.status(404).json({ success: false, message: 'Increment record not found' });

        record.status = 'Approved';
        record.approvedBy = req.user._id || req.user.id;
        record.approvedDate = new Date();
        if (req.body.remarks) record.remarks = req.body.remarks;
        await record.save();

        // Notify employee
        if (record.employeeId?.email) {
            await sendNotification({
                to: record.employeeId.email,
                channels: ['email'],
                subject: `Salary Increment Approved — FY ${record.financialYear}`,
                message: `Dear ${record.employeeId.firstName}, we are pleased to inform you that your salary increment of ${record.incrementPercentage}% (₹${record.incrementAmount.toLocaleString('en-IN')}) has been approved. Effective: ${new Date(record.effectiveDate).toLocaleDateString('en-IN')}. Your new gross salary will be ₹${record.newGross.toLocaleString('en-IN')}.`,
                tenantId: req.tenantId,
                userId: req.user._id,
                module: 'Increment',
                action: 'Increment Approved',
            }).catch(() => { });
        }

        res.json({ success: true, data: record, message: 'Increment approved' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * BULK APPROVE all increments for a financial year
 */
exports.bulkApproveIncrements = async (req, res) => {
    try {
        const { financialYear } = req.body;
        if (!financialYear) return res.status(400).json({ success: false, message: 'financialYear required' });

        const result = await IncrementRecord.updateMany(
            { tenantId: req.tenantId, financialYear, status: { $in: ['Computed', 'Pending HR'] } },
            { $set: { status: 'Approved', approvedBy: req.user._id || req.user.id, approvedDate: new Date() } }
        );

        res.json({ success: true, message: `${result.modifiedCount} increments approved`, count: result.modifiedCount });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * APPLY increment to employee record (update salary)
 */
exports.applyIncrementToEmployee = async (req, res) => {
    try {
        const record = await IncrementRecord.findOne({
            _id: req.params.id, tenantId: req.tenantId, status: 'Approved',
        }).populate('employeeId');

        if (!record) return res.status(404).json({ success: false, message: 'Approved increment record not found' });

        // Update employee's salary
        await Employee.findByIdAndUpdate(record.employeeId._id, {
            currentSalary: record.newGross,
            grossSalary: record.newGross,
        });

        record.status = 'Applied';
        record.payrollApplied = true;
        record.payrollAppliedDate = new Date();
        record.incrementLetterGenerated = true;
        record.incrementLetterDate = new Date();
        await record.save();

        res.json({ success: true, data: record, message: 'Increment applied to employee record' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * REJECT increment
 */
exports.rejectIncrement = async (req, res) => {
    try {
        const { reason } = req.body;
        const record = await IncrementRecord.findOneAndUpdate(
            { _id: req.params.id, tenantId: req.tenantId, status: { $in: ['Computed', 'Pending HR'] } },
            { status: 'Rejected', rejectedBy: req.user._id || req.user.id, rejectionReason: reason },
            { new: true }
        );
        if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
        res.json({ success: true, data: record });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Seed default increment policy (standard bank HR bands)
 */
exports.seedDefaultPolicy = async (req, res) => {
    try {
        const { financialYear, effectiveDate } = req.body;
        if (!financialYear || !effectiveDate) {
            return res.status(400).json({ success: false, message: 'financialYear and effectiveDate required' });
        }

        const existing = await IncrementPolicy.findOne({ tenantId: req.tenantId, financialYear, isActive: true });
        if (existing) return res.status(400).json({ success: false, message: 'Policy already exists for this FY' });

        const policy = await IncrementPolicy.create({
            tenantId: req.tenantId,
            financialYear,
            effectiveDate: new Date(effectiveDate),
            isActive: true,
            createdBy: req.user._id || req.user.id,
            ratingBands: [
                { label: 'Outstanding (5)', minRating: 4.5, maxRating: 5.0, incrementPercentage: 15, minIncrementAmount: 5000 },
                { label: 'Exceeds Expectations (4-4.49)', minRating: 4.0, maxRating: 4.49, incrementPercentage: 10, minIncrementAmount: 3000 },
                { label: 'Meets Expectations (3-3.99)', minRating: 3.0, maxRating: 3.99, incrementPercentage: 7, minIncrementAmount: 2000 },
                { label: 'Partially Meets (2-2.99)', minRating: 2.0, maxRating: 2.99, incrementPercentage: 3, minIncrementAmount: 1000 },
                { label: 'Below Expectations (1-1.99)', minRating: 1.0, maxRating: 1.99, incrementPercentage: 0, minIncrementAmount: 0 },
            ],
            gradeMultipliers: [
                { grade: 'Top Management', multiplier: 1.5 },
                { grade: 'Senior Management', multiplier: 1.3 },
                { grade: 'Middle Management', multiplier: 1.1 },
                { grade: 'Officer', multiplier: 1.0 },
                { grade: 'Clerk', multiplier: 1.0 },
                { grade: 'Sub-Staff', multiplier: 0.9 },
            ],
        });

        res.status(201).json({ success: true, data: policy, message: 'Default increment policy created' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
