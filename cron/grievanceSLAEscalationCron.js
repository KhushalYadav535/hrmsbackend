/**
 * CRON JOB: Grievance SLA Escalation
 * File: backend/cron/grievanceSLAEscalationCron.js
 * Schedule: "0 * * * *" (Every hour)
 * 
 * BRD Reference: BR-P1-004, Lines with grievance 6-stage workflow
 * Requirement: Auto-escalate grievances on SLA breach
 * 
 * 6-Stage Workflow:
 * SUBMITTED → ACKNOWLEDGED → ASSIGNED → INVESTIGATION → RESOLUTION → CLOSURE
 */

const mongoose = require('mongoose');
const moment = require('moment');

class GrievanceSLAEscalationCron {
  // Define SLA thresholds per stage (in hours)
  SLA_CONFIG = {
    SUBMITTED: { duration: 2, escalateTo: 'HR_HEAD', grace: 0.25 }, // 2 hours
    ACKNOWLEDGED: { duration: 24, escalateTo: 'SENIOR_HR', grace: 0.25 }, // 1 day
    ASSIGNED: { duration: 120, escalateTo: 'HR_HEAD', grace: 0.25 }, // 5 days
    INVESTIGATION: { duration: 120, escalateTo: 'DIRECTOR', grace: 0.25 }, // 5 days
    RESOLUTION: { duration: 48, escalateTo: 'DIRECTOR', grace: 0.25 }, // 2 days
  };

  async execute() {
    console.log('[GrievanceSLAEscalationCron] Starting SLA escalation check...');
    const startTime = Date.now();

    try {
      let grievancesChecked = 0;
      let breachesDetected = 0;
      let escalationsPerformed = 0;
      let errorCount = 0;

      // Get all non-closed grievances
      const grievances = await this.getOpenGrievances();
      console.log(`[GrievanceSLAEscalationCron] Found ${grievances.length} open grievances`);

      for (const grievance of grievances) {
        grievancesChecked++;
        try {
          const result = await this.checkAndEscalateIfNeeded(grievance);
          if (result.breachDetected) breachesDetected++;
          if (result.escalated) escalationsPerformed++;
        } catch (error) {
          console.error(`[GrievanceSLAEscalationCron] Error processing grievance ${grievance._id}:`, error);
          errorCount++;
        }
      }

      const executionTime = Date.now() - startTime;

      await this.logExecution({
        status: 'SUCCESS',
        grievancesChecked,
        breachesDetected,
        escalationsPerformed,
        errors: errorCount,
        executionTimeMs: executionTime,
      });

      console.log(`[GrievanceSLAEscalationCron] Completed in ${executionTime}ms. Breaches: ${breachesDetected}, Escalations: ${escalationsPerformed}`);

      return {
        status: 'SUCCESS',
        grievancesChecked,
        breachesDetected,
        escalationsPerformed,
        executionTimeMs: executionTime,
      };
    } catch (error) {
      console.error('[GrievanceSLAEscalationCron] Fatal error:', error);
      await this.logExecution({
        status: 'FAILED',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all open grievances (not CLOSED or WITHDRAWN)
   */
  async getOpenGrievances() {
    const Grievance = mongoose.model('Grievance');
    return await Grievance.find({
      status: {
        $nin: ['CLOSED', 'WITHDRAWN', 'RESOLVED_SATISFIED'],
      },
    }).populate('grievanceId companyId');
  }

  /**
   * Check if grievance has breached SLA and escalate if needed
   */
  async checkAndEscalateIfNeeded(grievance) {
    const result = {
      breachDetected: false,
      escalated: false,
      breachDetails: null,
    };

    const currentStatus = grievance.status;
    const slaConfig = this.SLA_CONFIG[currentStatus];

    if (!slaConfig) {
      return result; // No SLA defined for this status
    }

    // Get time spent in current status
    const lastStatusChangeTime = moment(grievance.last_status_change_date || grievance.createdAt);
    const now = moment();
    const timeSpentHours = now.diff(lastStatusChangeTime, 'hours', true);

    // Calculate SLA threshold with grace period
    const slaThresholdHours = slaConfig.duration * (1 + slaConfig.grace);

    // Check if SLA breached (25% grace period applied)
    if (timeSpentHours > slaThresholdHours && !grievance.sla_breached_at) {
      result.breachDetected = true;
      result.breachDetails = {
        status: currentStatus,
        timeSpentHours: Math.round(timeSpentHours * 100) / 100,
        slaHours: slaConfig.duration,
        breachedBy: Math.round((timeSpentHours - slaConfig.duration) * 100) / 100,
      };

      // Mark as breached
      grievance.sla_breached_at = now.toDate();
      grievance.sla_breach_status = currentStatus;

      // Perform escalation
      await this.escalateGrievance(grievance, slaConfig);
      result.escalated = true;

      // Save updated grievance
      await grievance.save();
    }

    return result;
  }

  /**
   * Escalate grievance to next level
   */
  async escalateGrievance(grievance, slaConfig) {
    const User = mongoose.model('User');
    const EscalationHistory = mongoose.model('EscalationHistory');

    // Get current escalation level
    const currentLevel = grievance.escalation_level || 0;
    const escalationChain = grievance.escalation_chain || [];

    // Determine next escalation level
    let escalationTarget;
    if (currentLevel < escalationChain.length - 1) {
      escalationTarget = escalationChain[currentLevel + 1];
    } else {
      // Already at max level, escalate to Company HR Head or above
      const admin = await User.findOne({
        tenantId: grievance.tenantId,
        role: { $in: ['COMPANY_ADMIN', 'HR_ADMIN'] },
      });
      escalationTarget = admin;
    }

    // Create escalation history record
    const escalation = await EscalationHistory.create({
      grievanceId: grievance._id,
      escalationFrom: grievance.assigned_to,
      escalationTo: escalationTarget?._id,
      escalationLevel: (currentLevel || 0) + 1,
      reason: `SLA breach in ${grievance.status} stage`,
      escalatedAt: new Date(),
      escalationChain: escalationChain,
    });

    // Update grievance
    grievance.escalation_level = (currentLevel || 0) + 1;
    grievance.assigned_to = escalationTarget?._id;
    grievance.last_escalation_date = new Date();

    // Send escalation notifications
    await this.sendEscalationNotifications(grievance, escalationTarget, slaConfig);

    // Create audit log
    await this.logEscalation(grievance, escalation);

    console.log(`[GrievanceSLAEscalationCron] Escalated grievance ${grievance._id} to level ${grievance.escalation_level}`);
  }

  /**
   * Send escalation notifications
   */
  async sendEscalationNotifications(grievance, escalationTarget, slaConfig) {
    const User = mongoose.model('User');

    // Get original submitter
    const submitter = await User.findById(grievance.submitted_by);

    // Email to escalation target
    if (escalationTarget) {
      console.log(`[GrievanceSLAEscalationCron] Sending escalation email to ${escalationTarget.email}`);
      // Implement email sending with your email service
    }

    // Email to original submitter (FYI)
    if (submitter) {
      console.log(`[GrievanceSLAEscalationCron] Sending FYI email to ${submitter.email} about escalation`);
    }

    // Dashboard notification for both
    // Implement in-app notifications via your notification service
  }

  /**
   * Log escalation action
   */
  async logEscalation(grievance, escalation) {
    const AuditLog = mongoose.model('AuditLog');
    
    await AuditLog.create({
      tenantId: grievance.tenantId,
      userId: 'SYSTEM_CRON',
      action: 'GRIEVANCE_SLA_ESCALATED',
      module: 'GRIEVANCE',
      entityType: 'GRIEVANCE',
      entityId: grievance._id,
      details: {
        escalationId: escalation._id,
        escalationLevel: escalation.escalationLevel,
        escalationFrom: escalation.escalationFrom,
        escalationTo: escalation.escalationTo,
        reason: escalation.reason,
      },
    });
  }

  /**
   * Log cron execution
   */
  async logExecution(data) {
    const CronExecutionLog = mongoose.model('CronExecutionLog');
    await CronExecutionLog.create({
      cronName: 'GrievanceSLAEscalation',
      status: data.status,
      grievancesChecked: data.grievancesChecked,
      breachesDetected: data.breachesDetected,
      escalationsPerformed: data.escalationsPerformed,
      errors: data.errors,
      executionTimeMs: data.executionTimeMs,
      error: data.error,
      executedAt: new Date(),
    });
  }
}

module.exports = new GrievanceSLAEscalationCron();
