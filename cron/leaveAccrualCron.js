/**
 * CRON JOB: Leave Accrual Automation
 * File: backend/cron/leaveAccrualCron.js
 * Schedule: "0 2 1 * *" (2 AM on 1st of every month - IST)
 * 
 * BRD Reference: Lines 40-85, LMS-002, LMS-003
 * Requirement: Auto-accrue leaves on scheduled dates
 * Currently: Requires manual API trigger (BREAKING BRD REQUIREMENT)
 */

const mongoose = require('mongoose');
const moment = require('moment');
const Logger = require('../utils/logger');

class LeaveAccrualCron {
  /**
   * Main execution method called by scheduler
   */
  async execute() {
    const startTime = Date.now();
    console.log('[LeaveAccrualCron] Starting leave accrual process...');

    try {
      // Get all companies with active LEAVE module
      const companiesWithLeave = await this.getCompaniesWithActiveLeaveModule();
      console.log(`[LeaveAccrualCron] Found ${companiesWithLeave.length} companies with LEAVE module`);

      let totalEmployeesProcessed = 0;
      let totalErrorCount = 0;
      let leavesAccrued = 0;

      // Process each company
      for (const company of companiesWithLeave) {
        try {
          const result = await this.accrueLeaveForCompany(company._id);
          totalEmployeesProcessed += result.employeesProcessed;
          totalErrorCount += result.errors;
          leavesAccrued += result.leavesAccrued;
        } catch (error) {
          console.error(`[LeaveAccrualCron] Error processing company ${company._id}:`, error);
          totalErrorCount++;
        }
      }

      // Create audit log
      const executionTime = Date.now() - startTime;
      await this.logExecution({
        status: 'SUCCESS',
        companiesProcessed: companiesWithLeave.length,
        employeesProcessed: totalEmployeesProcessed,
        leavesAccrued,
        errors: totalErrorCount,
        executionTimeMs: executionTime,
      });

      console.log(`[LeaveAccrualCron] Completed in ${executionTime}ms. Processed ${totalEmployeesProcessed} employees, accrued ${leavesAccrued} leave records.`);

      return {
        status: 'SUCCESS',
        companiesProcessed: companiesWithLeave.length,
        employeesProcessed: totalEmployeesProcessed,
        leavesAccrued,
        executionTimeMs: executionTime,
      };
    } catch (error) {
      console.error('[LeaveAccrualCron] Fatal error:', error);
      await this.logExecution({
        status: 'FAILED',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Accrue leaves for all employees in a specific company
   */
  async accrueLeaveForCompany(companyId) {
    const Employee = mongoose.model('Employee');
    const LeavePolicy = mongoose.model('LeavePolicy');
    const LeaveBalance = mongoose.model('LeaveBalance');
    const AuditLog = mongoose.model('AuditLog');

    let employeesProcessed = 0;
    let errors = 0;
    let leavesAccrued = 0;

    // Get all active employees
    const activeEmployees = await Employee.find({
      tenantId: companyId,
      employment_status: 'ACTIVE',
    });

    console.log(`[LeaveAccrualCron] Processing ${activeEmployees.length} employees for company ${companyId}`);

    for (const employee of activeEmployees) {
      try {
        // Get employee's leave policies
        const policies = await LeavePolicy.find({
          tenantId: companyId,
          is_active: true,
        });

        // Process each leave type policy
        for (const policy of policies) {
          const accrualAmount = this.calculateAccrualAmount(employee, policy);

          if (accrualAmount > 0) {
            // Get or create leave balance
            let leaveBalance = await LeaveBalance.findOne({
              tenantId: companyId,
              employeeId: employee._id,
              leave_type: policy.leave_type,
              fiscal_year: this.getCurrentFiscalYear(),
            });

            if (!leaveBalance) {
              leaveBalance = await LeaveBalance.create({
                tenantId: companyId,
                employeeId: employee._id,
                leave_type: policy.leave_type,
                fiscal_year: this.getCurrentFiscalYear(),
                opening_balance: 0,
                accrued_balance: accrualAmount,
                used_balance: 0,
                available_balance: accrualAmount,
              });
            } else {
              // Update existing balance
              leaveBalance.accrued_balance += accrualAmount;
              leaveBalance.available_balance = 
                leaveBalance.opening_balance + 
                leaveBalance.accrued_balance - 
                leaveBalance.used_balance;

              // Respect max accrual limit
              if (leaveBalance.available_balance > policy.max_accrual_limit) {
                leaveBalance.available_balance = policy.max_accrual_limit;
              }

              await leaveBalance.save();
            }

            leavesAccrued++;
          }
        }

        employeesProcessed++;

        // Update last accrual timestamp
        await Employee.updateOne(
          { _id: employee._id },
          { last_leave_accrual_date: new Date() }
        );

      } catch (error) {
        console.error(`[LeaveAccrualCron] Error processing employee ${employee._id}:`, error);
        errors++;
      }
    }

    // Send notification batch emails after processing
    await this.sendNotificationEmails(companyId, activeEmployees);

    // Create audit log
    await AuditLog.create({
      tenantId: companyId,
      userId: 'SYSTEM_CRON',
      action: 'LEAVE_ACCRUAL_PROCESSED',
      module: 'LEAVE',
      entityType: 'LEAVE_ACCRUAL',
      details: {
        employeesProcessed,
        leavesAccrued,
        errors,
        executedAt: new Date(),
      },
    });

    return { employeesProcessed, leavesAccrued, errors };
  }

  /**
   * Calculate accrual amount based on employee's joining date and policy frequency
   */
  calculateAccrualAmount(employee, policy) {
    const accrualFrequency = policy.accrual_frequency;
    const daysPerYear = policy.days_per_year;
    const joinDate = moment(employee.joining_date);
    const today = moment();

    // Check if employee is a new joiner (less than 12 months)
    const monthsEmployed = today.diff(joinDate, 'months', true);
    
    if (monthsEmployed < 1) {
      // Pro-rata accrual for new joiners
      const daysEmployed = today.diff(joinDate, 'days');
      return (daysPerYear / 365) * daysEmployed;
    }

    // Regular accrual based on frequency
    switch (accrualFrequency) {
      case 'MONTHLY':
        return daysPerYear / 12;
      case 'QUARTERLY':
        return (today.month() % 3 === 0) ? (daysPerYear / 4) : 0;
      case 'YEARLY':
        return (today.month() === 0 && today.date() === 1) ? daysPerYear : 0;
      case 'NONE':
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Get current financial/fiscal year
   */
  getCurrentFiscalYear() {
    const today = moment();
    // Assuming fiscal year starts on 1st April
    if (today.month() >= 3) { // April onwards
      return `${today.year()}-${today.year() + 1}`;
    } else {
      return `${today.year() - 1}-${today.year()}`;
    }
  }

  /**
   * Send notification emails to employees about accrued leaves
   */
  async sendNotificationEmails(companyId, employees) {
    // Batch send to avoid email service overload
    // Group employees by 100 and send in batches
    const batchSize = 100;
    
    for (let i = 0; i < employees.length; i += batchSize) {
      const batch = employees.slice(i, i + batchSize);
      const emailBatch = batch.map(emp => ({
        to: emp.email,
        subject: 'Leaves Accrued for Current Month',
        template: 'leave-accrual-notification',
        data: {
          employeeName: emp.first_name,
        },
      }));

      try {
        // Send batch emails (mock - implement with your email service)
        console.log(`[LeaveAccrualCron] Sending ${emailBatch.length} notification emails...`);
      } catch (error) {
        console.error(`[LeaveAccrualCron] Error sending notification emails:`, error);
      }
    }
  }

  /**
   * Get all companies with active LEAVE module
   */
  async getCompaniesWithActiveLeaveModule() {
    const CompanyModule = mongoose.model('CompanyModule');
    const PlatformModule = mongoose.model('PlatformModule');

    const leaveModule = await PlatformModule.findOne({ module_code: 'LEAVE' });

    if (!leaveModule) {
      throw new Error('LEAVE module not found in platform_modules');
    }

    return await CompanyModule.find({
      moduleId: leaveModule._id,
      is_enabled: true,
    }).distinct('tenantId');
  }

  /**
   * Log cron execution
   */
  async logExecution(data) {
    const CronExecutionLog = mongoose.model('CronExecutionLog');
    await CronExecutionLog.create({
      cronName: 'LeaveAccrual',
      status: data.status,
      companiesProcessed: data.companiesProcessed,
      employeesProcessed: data.employeesProcessed,
      leavesAccrued: data.leavesAccrued,
      errors: data.errors,
      executionTimeMs: data.executionTimeMs,
      error: data.error,
      executedAt: new Date(),
    });
  }
}

module.exports = new LeaveAccrualCron();
