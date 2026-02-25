const { addPayrollJob, getQueueJobStatus, getQueueStats } = require('../services/payrollQueueService');
const AuditLog = require('../models/AuditLog');

/**
 * POST /api/payroll/queue/process
 * Enqueue async payroll processing job for a month/year
 */
exports.enqueuePayrollJob = async (req, res) => {
    try {
        const { month, year, employeeIds, priority } = req.body;

        if (!month || !year) {
            return res.status(400).json({ success: false, message: 'month and year are required' });
        }

        const jobData = {
            tenantId: req.tenantId,
            month,
            year: Number(year),
            employeeIds: employeeIds || [], // empty = all active employees
            initiatedBy: req.user._id || req.user.id,
            initiatedByName: req.user.name || req.user.email,
            priority: priority || 0,
            enqueuedAt: new Date().toISOString(),
        };

        const result = await addPayrollJob(jobData);

        await AuditLog.create({
            tenantId: req.tenantId,
            userId: req.user._id || req.user.id,
            userName: req.user.name || req.user.email,
            userEmail: req.user.email,
            action: 'Process',
            module: 'Payroll Queue',
            details: JSON.stringify({ month, year, mode: result.mode, jobId: result.jobId }),
        });

        res.status(202).json({
            success: true,
            jobId: result.jobId,
            mode: result.mode,
            message: result.mode === 'async'
                ? `Payroll job queued (ID: ${result.jobId}). Poll /api/payroll/queue/job/${result.jobId} for status.`
                : 'Payroll processed synchronously (Redis not connected)',
            result: result.result || null, // immediate result for sync mode
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/payroll/queue/job/:jobId
 * Poll job status — used by frontend to track async payroll progress
 */
exports.getJobStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        const status = await getQueueJobStatus(jobId);

        if (!status || status.status === 'not_found') {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/payroll/queue/stats
 * Queue statistics — waiting, active, completed, failed jobs
 */
exports.getQueueStats = async (req, res) => {
    try {
        const stats = await getQueueStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
