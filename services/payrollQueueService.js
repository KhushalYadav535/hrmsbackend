/**
 * Payroll Job Queue Service
 * BRD Requirement: Async payroll processing for large employee sets
 * Uses Bull (Redis-backed job queue) to handle non-blocking payroll computation
 *
 * This prevents HTTP timeouts when processing 500+ employees at once.
 * Jobs are processed in the background; client polls /api/payroll/job/:jobId for status.
 */

const Queue = require('bull');
const mongoose = require('mongoose');

// ============================================================
// Redis connection (falls back gracefully if Redis not running)
// ============================================================
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let payrollQueue = null;
let queueAvailable = false;

function createQueue() {
    try {
        const queue = new Queue('payroll-processing', REDIS_URL, {
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: 100,  // Keep last 100 completed jobs
                removeOnFail: 50,       // Keep last 50 failed jobs
            },
        });

        queue.on('ready', () => {
            console.log('[PayrollQueue] Connected to Redis ✓');
            queueAvailable = true;
        });

        queue.on('error', (err) => {
            console.warn('[PayrollQueue] Redis unavailable:', err.message, '— Falling back to synchronous processing');
            queueAvailable = false;
        });

        return queue;
    } catch (err) {
        console.warn('[PayrollQueue] Failed to create queue:', err.message);
        return null;
    }
}

function getQueue() {
    if (!payrollQueue) {
        payrollQueue = createQueue();
    }
    return payrollQueue;
}

// ============================================================
// Job Status Store (in-memory fallback when Redis isn't available)
// ============================================================
const jobStatusStore = new Map();

function setJobStatus(jobId, status) {
    jobStatusStore.set(String(jobId), { ...jobStatusStore.get(String(jobId)), ...status, updatedAt: new Date() });
}

function getJobStatus(jobId) {
    return jobStatusStore.get(String(jobId));
}

// ============================================================
// Add a payroll job to the queue
// ============================================================
async function addPayrollJob(data) {
    const queue = getQueue();

    if (queue && queueAvailable) {
        const job = await queue.add('process-payroll', data, { priority: data.priority || 0 });
        setJobStatus(job.id, { status: 'queued', progress: 0, data });
        return { jobId: String(job.id), mode: 'async' };
    }

    // Fallback: execute synchronously (no Redis)
    const tempJobId = `sync-${Date.now()}`;
    setJobStatus(tempJobId, { status: 'processing', progress: 0, data });
    try {
        const result = await processPayrollWorker(data, (progress) => {
            setJobStatus(tempJobId, { progress });
        });
        setJobStatus(tempJobId, { status: 'completed', progress: 100, result });
        return { jobId: tempJobId, mode: 'sync', result };
    } catch (err) {
        setJobStatus(tempJobId, { status: 'failed', error: err.message });
        return { jobId: tempJobId, mode: 'sync', error: err.message };
    }
}

// ============================================================
// Worker: the actual payroll computation logic
// ============================================================
async function processPayrollWorker(data, progressCb) {
    const { tenantId, month, year, employeeIds, initiatedBy } = data;

    const Payroll = require('../models/Payroll');
    const Employee = require('../models/Employee');
    const SalaryStructure = require('../models/SalaryStructure');
    const AuditLog = require('../models/AuditLog');

    const filter = { tenantId };
    if (employeeIds && employeeIds.length > 0) {
        filter._id = { $in: employeeIds };
    } else {
        filter.status = 'Active';
    }

    const employees = await Employee.find(filter).select('_id firstName lastName employeeCode grossSalary currentSalary');
    const total = employees.length;
    let processed = 0, errors = 0;
    const errorList = [];

    for (const employee of employees) {
        try {
            // Check if payroll already exists
            const exists = await Payroll.findOne({ tenantId, employeeId: employee._id, month, year });
            if (exists) { processed++; continue; }

            // Get or compute salary
            const grossSalary = employee.currentSalary || employee.grossSalary || 0;

            // Standard HRA / PF / etc. breakdown (simplified)
            const basic = Math.round(grossSalary * 0.40);
            const hra = Math.round(grossSalary * 0.20);
            const da = Math.round(grossSalary * 0.10);
            const special = grossSalary - basic - hra - da;

            const pfEmployee = Math.round(Math.min(basic, 15000) * 0.12);
            const pfEmployer = pfEmployee;
            const esiEmployee = grossSalary <= 21000 ? Math.round(grossSalary * 0.0075) : 0;
            const esiEmployer = grossSalary <= 21000 ? Math.round(grossSalary * 0.0325) : 0;
            const professionalTax = grossSalary > 15000 ? 200 : grossSalary > 10000 ? 150 : 0;

            const totalDeductions = pfEmployee + esiEmployee + professionalTax;
            const netSalary = grossSalary - totalDeductions;

            await Payroll.create({
                tenantId,
                employeeId: employee._id,
                month,
                year,
                grossSalary,
                basicSalary: basic,
                hra,
                da,
                specialAllowance: special,
                pfEmployee,
                pfEmployer,
                esiEmployee,
                esiEmployer,
                professionalTax,
                totalDeductions,
                netSalary,
                status: 'Draft',
                processedBy: initiatedBy,
                processedAt: new Date(),
            });

            processed++;
        } catch (err) {
            errors++;
            errorList.push(`${employee.employeeCode}: ${err.message}`);
        }

        // Report progress every 10 employees
        if (processed % 10 === 0 && progressCb) {
            progressCb(Math.round((processed / total) * 100));
        }
    }

    await AuditLog.create({
        tenantId,
        userId: initiatedBy,
        action: 'Process',
        module: 'Payroll (Async)',
        details: JSON.stringify({ month, year, total, processed, errors }),
    }).catch(() => { });

    return { total, processed, errors, errorList, month, year };
}

// ============================================================
// Register the worker processor with Bull
// ============================================================
function registerWorker() {
    const queue = getQueue();
    if (!queue) return;

    queue.process('process-payroll', 3, async (job) => {
        job.log(`Starting payroll for ${job.data.month}/${job.data.year}`);
        const result = await processPayrollWorker(job.data, async (progress) => {
            await job.progress(progress);
        });
        return result;
    });

    queue.on('completed', (job, result) => {
        setJobStatus(job.id, { status: 'completed', progress: 100, result });
        console.log(`[PayrollQueue] Job ${job.id} completed: ${result.processed}/${result.total} employees`);
    });

    queue.on('failed', (job, err) => {
        setJobStatus(job.id, { status: 'failed', error: err.message });
        console.error(`[PayrollQueue] Job ${job.id} failed:`, err.message);
    });

    queue.on('progress', (job, progress) => {
        setJobStatus(job.id, { status: 'processing', progress });
    });

    console.log('[PayrollQueue] Worker registered ✓');
}

// ============================================================
// Get job status (for polling endpoint)
// ============================================================
async function getQueueJobStatus(jobId) {
    // Check in-memory store first
    const memStatus = getJobStatus(jobId);

    const queue = getQueue();
    if (queue && queueAvailable && !jobId.startsWith('sync-')) {
        try {
            const job = await queue.getJob(jobId);
            if (job) {
                const state = await job.getState();
                const progress = job.progress();
                const result = job.returnvalue;
                const failReason = job.failedReason;
                return { jobId, status: state, progress, result, error: failReason };
            }
        } catch { }
    }

    return memStatus || { jobId, status: 'not_found' };
}

// ============================================================
// Queue stats
// ============================================================
async function getQueueStats() {
    const queue = getQueue();
    if (!queue || !queueAvailable) {
        return { available: false, mode: 'synchronous' };
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
    ]);

    return { available: true, mode: 'async', waiting, active, completed, failed, delayed };
}

module.exports = { addPayrollJob, getQueueJobStatus, getQueueStats, registerWorker, setJobStatus };
