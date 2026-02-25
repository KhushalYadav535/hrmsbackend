/**
 * Scheduled Jobs / Cron Service
 * BRD Requirements:
 *   - Scheduled report emails (node-cron)
 *   - Data archival (old records > 7 years)
 *   - Tax proof deadline lock (Jan 31 auto-lock)
 *   - Leave year-end lapse
 *   - Medical certificate reminder (SL > 3 days pending)
 */

const cron = require('node-cron');
const ScheduledReport = require('../models/ScheduledReport');
const TaxDeclaration = require('../models/TaxDeclaration');
const LeaveRequest = require('../models/LeaveRequest');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('./notificationService');
const reportService = require('../services/reportService');

let initialized = false;

function initScheduledJobs() {
    if (initialized) return;
    initialized = true;

    console.log('[CRON] Initializing scheduled jobs...');

    // ═══════════════════════════════════════════════════
    // 1. SCHEDULED REPORT EMAILS — Check every hour
    // ═══════════════════════════════════════════════════
    cron.schedule('0 * * * *', async () => {
        try {
            const now = new Date();
            const reports = await ScheduledReport.find({
                isActive: true,
                nextRunAt: { $lte: now },
            }).populate('tenantId', 'name');

            for (const report of reports) {
                try {
                    await runScheduledReport(report);
                    // Update next run time
                    report.lastRunAt = now;
                    report.nextRunAt = computeNextRun(report.frequency, now);
                    report.lastRunStatus = 'success';
                    await report.save();
                } catch (err) {
                    report.lastRunStatus = 'failed';
                    report.lastRunError = err.message;
                    await report.save();
                    console.error(`[CRON] Scheduled report failed: ${report.name}`, err.message);
                }
            }
        } catch (err) {
            console.error('[CRON] Scheduled reports job error:', err.message);
        }
    });

    // ═══════════════════════════════════════════════════
    // 2. TAX PROOF DEADLINE LOCK — Runs daily at midnight
    //    Locks all Draft declarations where today > Jan 31
    // ═══════════════════════════════════════════════════
    cron.schedule('0 0 * * *', async () => {
        try {
            const today = new Date();
            const month = today.getMonth() + 1; // 1-indexed
            const day = today.getDate();
            const year = today.getFullYear();

            // After Jan 31 → current FY, After March 31 → previous FY
            // Lock declarations in Draft status submitted after Jan 31
            if (month > 1 || (month === 1 && day >= 31)) {
                const fy = month <= 3
                    ? `${year - 1}-${String(year).slice(-4)}`
                    : `${year}-${String(year + 1).slice(-4)}`;

                const result = await TaxDeclaration.updateMany(
                    { status: 'Draft', financialYear: fy, submissionDate: { $lt: new Date(year, 0, 31) } },
                    { $set: { status: 'Submitted', submissionDate: new Date() } }
                );

                if (result.modifiedCount > 0) {
                    console.log(`[CRON] Tax deadline lock: Auto-submitted ${result.modifiedCount} declarations for FY ${fy}`);
                }
            }
        } catch (err) {
            console.error('[CRON] Tax deadline lock error:', err.message);
        }
    });

    // ═══════════════════════════════════════════════════
    // 3. MEDICAL CERTIFICATE REMINDER — Runs daily at 9am
    //    SL > 3 days approved but no medical cert uploaded
    // ═══════════════════════════════════════════════════
    cron.schedule('0 9 * * *', async () => {
        try {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            const pendingMedical = await LeaveRequest.find({
                leaveType: 'Sick Leave',
                status: 'Approved',
                numberOfDays: { $gt: 3 },
                medicalCertificateUrl: { $in: [null, '', undefined] },
                medicalCertificateRequested: { $ne: true },
                fromDate: { $lte: threeDaysAgo },
            }).populate('employeeId', 'firstName lastName email');

            for (const leave of pendingMedical) {
                if (leave.employeeId?.email) {
                    await sendNotification({
                        to: leave.employeeId.email,
                        channels: ['email'],
                        subject: 'Action Required: Medical Certificate for Sick Leave',
                        message: `Your sick leave (${new Date(leave.fromDate).toLocaleDateString('en-IN')} to ${new Date(leave.toDate).toLocaleDateString('en-IN')}) was for more than 3 days. Please upload your medical certificate immediately to avoid LOP deduction.`,
                        tenantId: leave.tenantId,
                        userId: null,
                        module: 'Leave Management',
                        action: 'Medical Certificate Reminder',
                    }).catch(() => { });
                }
                leave.medicalCertificateRequested = true;
                await leave.save();
            }

            if (pendingMedical.length > 0) {
                console.log(`[CRON] Medical cert reminders sent: ${pendingMedical.length}`);
            }
        } catch (err) {
            console.error('[CRON] Medical cert reminder error:', err.message);
        }
    });

    // ═══════════════════════════════════════════════════
    // 4. DATA ARCHIVAL — Runs on 1st of every month at 2am
    //    Archives audit logs older than 7 years
    // ═══════════════════════════════════════════════════
    cron.schedule('0 2 1 * *', async () => {
        try {
            const cutoff = new Date();
            cutoff.setFullYear(cutoff.getFullYear() - 7);

            // Archive (soft delete) old audit logs by marking as archived
            const result = await AuditLog.updateMany(
                { createdAt: { $lt: cutoff }, archived: { $ne: true } },
                { $set: { archived: true, archivedAt: new Date() } }
            );

            if (result.modifiedCount > 0) {
                console.log(`[CRON] Data archival: Archived ${result.modifiedCount} audit log records older than 7 years`);
            }
        } catch (err) {
            console.error('[CRON] Data archival error:', err.message);
        }
    });

    // ═══════════════════════════════════════════════════
    // 5. LEAVE YEAR-END LAPSE — Runs Dec 31 at 11:59 PM
    //    Lapses non-carry-forward leave balances
    // ═══════════════════════════════════════════════════
    cron.schedule('59 23 31 12 *', async () => {
        try {
            console.log('[CRON] Year-end leave lapse starting...');
            // The actual leave lapse logic is in leaveAccrualController
            // Here we just log it — the leave controller handles the batch
            const LeaveBalance = require('../models/LeaveBalance');
            const LeavePolicy = require('../models/LeavePolicy');

            const policies = await LeavePolicy.find({ carryForward: false, status: 'Active' });
            let lapsed = 0;
            for (const policy of policies) {
                const result = await LeaveBalance.updateMany(
                    { tenantId: policy.tenantId, leaveType: policy.leaveType, balance: { $gt: 0 } },
                    { $set: { balance: 0, lapseDate: new Date(), lapsedYear: new Date().getFullYear() } }
                );
                lapsed += result.modifiedCount;
            }
            console.log(`[CRON] Year-end: Lapsed ${lapsed} leave balances for non-carry-forward leaves`);
        } catch (err) {
            console.error('[CRON] Year-end leave lapse error:', err.message);
        }
    });

    console.log('[CRON] All scheduled jobs initialized ✓');
}

// ---- Helpers -----

async function runScheduledReport(report) {
    const data = await reportService.generateReport(report.reportType, report.tenantId, report.filters || {});
    for (const email of (report.recipientEmails || [])) {
        await sendNotification({
            to: email,
            channels: ['email'],
            subject: `Scheduled Report: ${report.name}`,
            message: `Please find your scheduled ${report.name} report attached. Generated on: ${new Date().toLocaleDateString('en-IN')}`,
            tenantId: report.tenantId,
            userId: null,
            module: 'Reports',
            action: 'Scheduled Report',
            attachmentData: JSON.stringify(data, null, 2),
        });
    }
}

function computeNextRun(frequency, from) {
    const next = new Date(from);
    switch (frequency) {
        case 'Daily': next.setDate(next.getDate() + 1); break;
        case 'Weekly': next.setDate(next.getDate() + 7); break;
        case 'Monthly': next.setMonth(next.getMonth() + 1); break;
        case 'Quarterly': next.setMonth(next.getMonth() + 3); break;
        default: next.setDate(next.getDate() + 1);
    }
    return next;
}

module.exports = { initScheduledJobs };
