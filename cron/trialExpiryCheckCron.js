/**
 * CRON JOB: Trial Expiry & Auto-Disable
 * File: backend/cron/trialExpiryCheckCron.js
 * Schedule: "0 0,6,12,18 * * *" (Every 6 hours - 00:00, 06:00, 12:00, 18:00 IST)
 * 
 * BRD Reference: Lines 1950-2000, DM-027
 * Requirement: Auto-disable modules on trial expiry, send advance notifications
 */

const mongoose = require('mongoose');
const moment = require('moment');

class TrialExpiryCheckCron {
  async execute() {
    console.log('[TrialExpiryCheckCron] Starting trial expiry check...');
    const startTime = Date.now();

    try {
      let notificationsSet = 0;
      let modulesDisabled = 0;
      let errorCount = 0;

      // Get all company modules with active trials
      const trialsToCheck = await this.getActiveTrials();
      console.log(`[TrialExpiryCheckCron] Found ${trialsToCheck.length} active trials`);

      for (const trial of trialsToCheck) {
        try {
          const result = await this.processTrialExpiry(trial);
          if (result.notificationSent) notificationsSet++;
          if (result.moduleDisabled) modulesDisabled++;
        } catch (error) {
          console.error(`[TrialExpiryCheckCron] Error processing trial ${trial._id}:`, error);
          errorCount++;
        }
      }

      const executionTime = Date.now() - startTime;

      await this.logExecution({
        status: 'SUCCESS',
        trialsProcessed: trialsToCheck.length,
        notificationsSet,
        modulesDisabled,
        errors: errorCount,
        executionTimeMs: executionTime,
      });

      console.log(`[TrialExpiryCheckCron] Completed in ${executionTime}ms`);

      return {
        status: 'SUCCESS',
        trialsProcessed: trialsToCheck.length,
        notificationsSet,
        modulesDisabled,
        executionTimeMs: executionTime,
      };
    } catch (error) {
      console.error('[TrialExpiryCheckCron] Fatal error:', error);
      await this.logExecution({
        status: 'FAILED',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all active trials expiring within next 14 days + already expired
   */
  async getActiveTrials() {
    const CompanyModule = mongoose.model('CompanyModule');
    const now = moment();
    const fourteenDaysLater = moment().add(14, 'days');

    return await CompanyModule.find({
      is_trial: true,
      is_enabled: true,
      trial_end_date: {
        $lte: fourteenDaysLater.toDate(),
        $gte: moment('2020-01-01').toDate(), // Avoid very old trials
      },
    }).populate(['moduleId', 'tenantId']);
  }

  /**
   * Process individual trial expiry
   */
  async processTrialExpiry(trial) {
    const CompanyModule = mongoose.model('CompanyModule');
    const today = moment();
    const trialEndDate = moment(trial.trial_end_date);
    const daysLeft = trialEndDate.diff(today, 'days');
    
    let result = {
      notificationSent: false,
      moduleDisabled: false,
      subscriptionConverted: false,
    };

    const company = trial.tenantId;
    const module = trial.moduleId;

    // CASE 1: 14 days before expiry
    if (daysLeft === 14) {
      await this.sendTrialWarning(company, module, daysLeft);
      result.notificationSent = true;
    }

    // CASE 2: 7 days before expiry
    else if (daysLeft === 7) {
      await this.sendTrialWarning(company, module, daysLeft);
      result.notificationSent = true;
    }

    // CASE 3: 1 day before expiry
    else if (daysLeft === 1) {
      await this.sendTrialWarning(company, module, daysLeft);
      result.notificationSent = true;
    }

    // CASE 4: Trial has expired
    else if (daysLeft <= 0) {
      // Check if payment received for conversion to paid subscription
      const paymentReceived = await this.checkPaymentReceived(company, module);

      if (paymentReceived) {
        // Convert trial to paid subscription
        trial.is_trial = false;
        trial.subscription_start_date = today.toDate();
        trial.subscription_source = 'TRIAL_CONVERTED';
        trial.trial_end_date = null;
        await trial.save();

        await this.sendTrialConvertedEmail(company, module);
        result.subscriptionConverted = true;

        console.log(`[TrialExpiryCheckCron] Trial converted to paid for ${module.module_name}`);
      } else {
        // Disable module - trial expired without payment
        trial.is_enabled = false;
        trial.deactivation_date = today.toDate();
        trial.deactivation_reason = 'TRIAL_EXPIRED_NO_PAYMENT';
        await trial.save();

        // Archive module data
        await this.archiveModuleData(company._id, module._id);

        await this.sendTrialExpiredDisabledEmail(company, module);
        result.moduleDisabled = true;

        console.log(`[TrialExpiryCheckCron] Module ${module.module_name} disabled due to trial expiry`);
      }

      // Create audit log
      await this.logTrialExpiryAction(company._id, module._id, result);
    }

    return result;
  }

  /**
   * Send trial expiry warning email
   */
  async sendTrialWarning(company, module, daysLeft) {
    const User = mongoose.model('User');
    
    // Get company admins
    const admins = await User.find({
      tenantId: company._id,
      roles: 'COMPANY_ADMIN',
    });

    const adminEmails = admins.map(a => a.email);

    // Mock email sending - implement with your email service
    console.log(`[TrialExpiryCheckCron] Sending trial warning to ${adminEmails.join(', ')}: ${daysLeft} days left`);

    return {
      to: adminEmails,
      subject: `${module.module_name} Trial Expires in ${daysLeft} Days`,
      body: `
        Dear Admin,
        
        Your trial period for ${module.module_name} will expire in ${daysLeft} days.
        
        To continue using this module, please upgrade to a paid subscription.
        
        Log in to your account to manage your subscription or contact support.
        
        Best regards,
        Platform HRMS Team
      `,
    };
  }

  /**
   * Send trial to paid conversion email
   */
  async sendTrialConvertedEmail(company, module) {
    const User = mongoose.model('User');
    const admins = await User.find({
      tenantId: company._id,
      roles: 'COMPANY_ADMIN',
    });

    console.log(`[TrialExpiryCheckCron] Sending trial conversion confirmation email`);

    return {
      to: admins.map(a => a.email),
      subject: `${module.module_name} Subscription Activated`,
      body: `Your trial has been converted to a paid subscription.`,
    };
  }

  /**
   * Send module disabled notification
   */
  async sendTrialExpiredDisabledEmail(company, module) {
    const User = mongoose.model('User');
    const admins = await User.find({
      tenantId: company._id,
      roles: 'COMPANY_ADMIN',
    });

    console.log(`[TrialExpiryCheckCron] Sending module disabled notification`);

    return {
      to: admins.map(a => a.email),
      subject: `${module.module_name} Module Disabled - Trial Expired`,
      body: `
        Your trial period for ${module.module_name} has expired.
        The module has been disabled.
        Your data has been archived and can be restored if you upgrade to a paid subscription.
      `,
    };
  }

  /**
   * Check if payment was received for trial conversion
   */
  async checkPaymentReceived(company, module) {
    const Payment = mongoose.model('Payment');
    
    // Check if payment received in last 7 days for this company/module
    const seventDaysAgo = moment().subtract(7, 'days').toDate();
    
    const payment = await Payment.findOne({
      companyId: company._id,
      moduleId: module._id,
      status: 'PAID',
      paymentDate: { $gt: seventDaysAgo },
    });

    return !!payment;
  }

  /**
   * Archive module data before disabling
   */
  async archiveModuleData(companyId, moduleId) {
    const module = await mongoose.model('PlatformModule').findById(moduleId);
    
    // Archive based on module type
    // This is a simplified version - implement based on your data structure
    try {
      console.log(`[TrialExpiryCheckCron] Archiving data for module ${module.module_code}`);
      // Move data to archive tables based on module
      // Don't delete - maintain compliance
    } catch (error) {
      console.error(`[TrialExpiryCheckCron] Error archiving module data:`, error);
    }
  }

  /**
   * Get all active trials
   */
  async getActiveTrials() {
    const CompanyModule = mongoose.model('CompanyModule');
    return await CompanyModule.find({
      is_trial: true,
      trial_end_date: { $exists: true, $ne: null },
    }).select('+trial_start_date +trial_end_date').lean();
  }

  /**
   * Log trial expiry action
   */
  async logTrialExpiryAction(companyId, moduleId, result) {
    const AuditLog = mongoose.model('AuditLog');
    
    await AuditLog.create({
      tenantId: companyId,
      userId: 'SYSTEM_CRON',
      action: result.moduleDisabled ? 'TRIAL_EXPIRED_DISABLED' : 'TRIAL_CONVERTED',
      module: 'DYNAMIC_MODULE',
      entityType: 'COMPANY_MODULE',
      details: result,
    });
  }

  /**
   * Log cron execution
   */
  async logExecution(data) {
    const CronExecutionLog = mongoose.model('CronExecutionLog');
    await CronExecutionLog.create({
      cronName: 'TrialExpiryCheck',
      status: data.status,
      trialsProcessed: data.trialsProcessed,
      notificationsSet: data.notificationsSet,
      modulesDisabled: data.modulesDisabled,
      errors: data.errors,
      executionTimeMs: data.executionTimeMs,
      error: data.error,
      executedAt: new Date(),
    });
  }
}

module.exports = new TrialExpiryCheckCron();
