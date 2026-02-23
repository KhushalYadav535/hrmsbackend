const mongoose = require('mongoose');
const PlatformModule = require('../models/PlatformModule');
const CompanyModule = require('../models/CompanyModule');
const ModuleActivationRequest = require('../models/ModuleActivationRequest');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const CompanySubscription = require('../models/CompanySubscription');
const ModuleUsageLog = require('../models/ModuleUsageLog');
const ModuleChangeHistory = require('../models/ModuleChangeHistory');
const Tenant = require('../models/Tenant');

/**
 * Module Management Service
 * BRD: Dynamic Module Management System - DM-008
 */
class ModuleManagementService {
  
  /**
   * Get all platform modules
   */
  async getAllModules(filters = {}) {
    const query = {};
    
    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }
    
    if (filters.category) {
      query.moduleCategory = filters.category;
    }
    
    const modules = await PlatformModule.find(query)
      .populate('parentModuleId', 'moduleName moduleCode')
      .sort({ sortOrder: 1, moduleName: 1 });
    
    return modules;
  }

  /**
   * Get modules for a specific company (tenant)
   */
  async getCompanyModules(tenantId, includeInactive = false) {
    const query = { tenantId };
    
    if (!includeInactive) {
      query.isEnabled = true;
    }

    const companyModules = await CompanyModule.find(query)
      .populate('moduleId')
      .sort({ activationDate: -1 });

    return companyModules;
  }

  /**
   * Check if a module is enabled for a company (tenant)
   */
  async isModuleEnabled(tenantId, moduleCode) {
    const module = await PlatformModule.findOne({ moduleCode });
    
    if (!module) {
      return false;
    }
    
    const companyModule = await CompanyModule.findOne({
      tenantId,
      moduleId: module._id,
      isEnabled: true,
    });

    return !!companyModule;
  }

  /**
   * Enable a module for a company (tenant)
   */
  async enableModule(data) {
    const {
      tenantId,
      moduleId,
      pricingModel,
      monthlyCost,
      userLimit,
      moduleConfig,
      trialDays,
      activatedBy,
    } = data;

    // 1. Validate module exists
    const module = await PlatformModule.findById(moduleId);
    if (!module) {
      throw new Error('Module not found');
    }

    // 2. Check if dependencies are met
    if (module.dependsOnModules && module.dependsOnModules.length > 0) {
      for (const depCode of module.dependsOnModules) {
        const isDepEnabled = await this.isModuleEnabled(tenantId, depCode);
        if (!isDepEnabled) {
          throw new Error(`Dependency module '${depCode}' must be enabled first`);
        }
      }
    }

    // 3. Check for conflicts
    if (module.conflictsWithModules && module.conflictsWithModules.length > 0) {
      for (const conflictCode of module.conflictsWithModules) {
        const isConflictEnabled = await this.isModuleEnabled(tenantId, conflictCode);
        if (isConflictEnabled) {
          throw new Error(`Cannot enable - conflicts with active module '${conflictCode}'`);
        }
      }
    }

    // 4. Create/update company_modules record
    const activationDate = new Date();
    const trialEndDate = trialDays 
      ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
      : null;

    const companyModuleData = {
      tenantId,
      moduleId,
      isEnabled: true,
      activationDate,
      deactivationDate: null,
      trialStartDate: trialDays ? activationDate : null,
      trialEndDate,
      pricingModel: pricingModel || module.pricingModel,
      monthlyCost: monthlyCost || module.basePrice || 0,
      userLimit,
      moduleConfig: moduleConfig || {},
      updatedBy: activatedBy,
    };

    const companyModule = await CompanyModule.findOneAndUpdate(
      { tenantId, moduleId },
      {
        ...companyModuleData,
        approvedBy: activatedBy,
        approvedAt: activationDate,
        requestedBy: activatedBy,
        requestedAt: activationDate,
        createdBy: activatedBy,
      },
      { upsert: true, new: true }
    );

    // 5. Log change history
    await ModuleChangeHistory.create({
      tenantId,
      moduleId,
      changeType: trialDays ? 'TRIAL_STARTED' : 'ACTIVATED',
      newStatus: 'ENABLED',
      newConfig: moduleConfig,
      reason: trialDays ? `Trial activation for ${trialDays} days` : 'Module activation',
      changedBy: activatedBy,
    });

    // 6. Update subscription cost
    await this.updateSubscriptionCost(tenantId);

    // 7. Initialize module (call module-specific setup if needed)
    if (module.requiresSetup) {
      await this.initializeModule(tenantId, module.moduleCode);
    }

    return companyModule;
  }

  /**
   * Disable a module for a company (tenant)
   */
  async disableModule(tenantId, moduleId, reason, disabledBy) {
    const module = await PlatformModule.findById(moduleId);
    if (!module) {
      throw new Error('Module not found');
    }

    // Cannot disable core modules
    if (module.isCore) {
      throw new Error('Core modules cannot be disabled');
    }

    // Check if any enabled modules depend on this
    const dependentModules = await CompanyModule.find({
      tenantId,
      isEnabled: true,
    }).populate('moduleId');

    for (const cm of dependentModules) {
      if (cm.moduleId && cm.moduleId.dependsOnModules) {
        if (cm.moduleId.dependsOnModules.includes(module.moduleCode)) {
          throw new Error(`Cannot disable - required by: ${cm.moduleId.moduleName}`);
        }
      }
    }

    // Get current state for logging
    const currentState = await CompanyModule.findOne({
      tenantId,
      moduleId,
    });

    if (!currentState) {
      throw new Error('Module is not enabled for this company');
    }

    // Disable module
    const updated = await CompanyModule.findOneAndUpdate(
      { tenantId, moduleId },
      {
        isEnabled: false,
        deactivationDate: new Date(),
        deactivationReason: reason,
        deactivatedBy: disabledBy,
        updatedBy: disabledBy,
      },
      { new: true }
    );

    // Log change history
    await ModuleChangeHistory.create({
      tenantId,
      moduleId,
      changeType: 'DEACTIVATED',
      oldStatus: 'ENABLED',
      newStatus: 'DISABLED',
      oldConfig: currentState.moduleConfig,
      reason,
      changedBy: disabledBy,
    });

    // Update subscription cost
    await this.updateSubscriptionCost(tenantId);

    return updated;
  }

  /**
   * Request module activation (Company Admin)
   */
  async requestModuleActivation(data) {
    const {
      tenantId,
      moduleId,
      requestType,
      businessJustification,
      expectedUsers,
      trialRequested,
      requestedBy,
    } = data;

    // Check if already enabled
    const existing = await CompanyModule.findOne({
      tenantId,
      moduleId,
      isEnabled: true,
    });

    if (existing) {
      throw new Error('Module is already enabled for this company');
    }

    // Create request
    const request = await ModuleActivationRequest.create({
      tenantId,
      moduleId,
      requestType,
      businessJustification,
      expectedUsers,
      trialRequested,
      trialDurationDays: trialRequested ? 30 : undefined,
      requestedBy,
      status: 'PENDING',
    });

    // TODO: Notify platform admin
    // await this.notifyPlatformAdmin(request);

    return request;
  }

  /**
   * Approve module activation request (Platform Admin)
   */
  async approveModuleRequest(requestId, approvedBy, customPricing = null) {
    const request = await ModuleActivationRequest.findById(requestId)
      .populate('moduleId');

    if (!request) {
      throw new Error('Request not found');
    }

    if (request.status !== 'PENDING') {
      throw new Error('Request is not in pending status');
    }

    // Update request status
    request.status = 'APPROVED';
    request.reviewedBy = approvedBy;
    request.reviewedAt = new Date();
    request.approvedAt = new Date();
    await request.save();

    // Enable the module
    const moduleData = {
      tenantId: request.tenantId,
      moduleId: request.moduleId._id,
      pricingModel: customPricing?.pricingModel || request.moduleId.pricingModel,
      monthlyCost: customPricing?.monthlyCost || request.moduleId.basePrice || 0,
      userLimit: request.expectedUsers,
      trialDays: request.trialRequested ? request.trialDurationDays : null,
      activatedBy: approvedBy,
    };

    await this.enableModule(moduleData);

    // TODO: Notify company admin
    // await this.notifyCompanyAdmin(request, 'APPROVED');

    return request;
  }

  /**
   * Reject module activation request
   */
  async rejectModuleRequest(requestId, rejectedBy, rejectionReason) {
    const request = await ModuleActivationRequest.findById(requestId);

    if (!request) {
      throw new Error('Request not found');
    }

    if (request.status !== 'PENDING') {
      throw new Error('Request is not in pending status');
    }

    request.status = 'REJECTED';
    request.reviewedBy = rejectedBy;
    request.reviewedAt = new Date();
    request.rejectedAt = new Date();
    request.rejectionReason = rejectionReason;
    await request.save();

    // TODO: Notify company admin
    // await this.notifyCompanyAdmin(request, 'REJECTED');

    return request;
  }

  /**
   * Apply subscription package to a company (tenant)
   */
  async applySubscriptionPackage(tenantId, packageId, activatedBy) {
    const subscriptionPackage = await SubscriptionPackage.findById(packageId);

    if (!subscriptionPackage) {
      throw new Error('Package not found');
    }

    const includedModules = subscriptionPackage.includedModules || [];

    // Enable all included modules
    for (const moduleCode of includedModules) {
      const module = await PlatformModule.findOne({ moduleCode });

      if (module) {
        try {
          await this.enableModule({
            tenantId,
            moduleId: module._id,
            pricingModel: 'BUNDLED',
            monthlyCost: 0, // Cost is at package level
            activatedBy,
          });
        } catch (error) {
          console.error(`Failed to enable module ${moduleCode}:`, error.message);
          // Continue with other modules
        }
      }
    }

    // Create or update subscription record
    const subscription = await CompanySubscription.findOneAndUpdate(
      { tenantId },
      {
        tenantId,
        packageId,
        subscriptionType: 'PACKAGE_BASED',
        status: 'ACTIVE',
        startDate: new Date(),
        totalMonthlyCost: subscriptionPackage.monthlyPrice,
        billingCycle: 'MONTHLY',
        userLimit: subscriptionPackage.maxUsers,
        storageLimitGb: subscriptionPackage.maxStorageGb,
        createdBy: activatedBy,
      },
      { upsert: true, new: true }
    );

    return subscription;
  }

  /**
   * Get module usage statistics
   */
  async getModuleUsage(tenantId, moduleId, dateRange) {
    const { startDate, endDate } = dateRange;

    const usage = await ModuleUsageLog.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          moduleId: new mongoose.Types.ObjectId(moduleId),
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalActions: { $sum: 1 },
          totalDurationSeconds: { $sum: '$durationSeconds' },
        },
      },
    ]);

    // Get unique users
    const uniqueUsers = await ModuleUsageLog.distinct('userId', {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      moduleId: new mongoose.Types.ObjectId(moduleId),
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    return {
      totalActions: usage[0]?.totalActions || 0,
      totalDurationSeconds: usage[0]?.totalDurationSeconds || 0,
      uniqueUsers: uniqueUsers.length,
    };
  }

  /**
   * Update subscription cost after module changes
   */
  async updateSubscriptionCost(tenantId) {
    const activeModules = await CompanyModule.find({
      tenantId,
      isEnabled: true,
    });

    const totalCost = activeModules.reduce((sum, m) => sum + (m.monthlyCost || 0), 0);

    await CompanySubscription.updateMany(
      {
        tenantId,
        status: 'ACTIVE',
      },
      {
        totalMonthlyCost: totalCost,
      }
    );

    return totalCost;
  }

  /**
   * Initialize module (create default configs, seed data, etc.)
   */
  async initializeModule(tenantId, moduleCode) {
    // Module-specific initialization logic
    switch (moduleCode) {
      case 'LEAVE':
        // TODO: Create default leave types for tenant
        // await this.initializeLeaveTypes(tenantId);
        break;
      case 'PAYROLL':
        // TODO: Create default salary components for tenant
        // await this.initializePayrollComponents(tenantId);
        break;
      case 'PERFORMANCE':
        // TODO: Create default competencies and rating scale for tenant
        // await this.initializePerformanceFramework(tenantId);
        break;
      // Add other modules as needed
    }
  }

  /**
   * Check trial expiry and send notifications
   */
  async checkTrialExpiry() {
    const expiringTrials = await CompanyModule.find({
      isEnabled: true,
      trialEndDate: {
        $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        $gte: new Date(),
      },
    })
      .populate('moduleId')
      .populate('tenantId');

    for (const trial of expiringTrials) {
      const daysLeft = Math.ceil(
        (new Date(trial.trialEndDate) - new Date()) / (1000 * 60 * 60 * 24)
      );

      // TODO: Send notification
      // await this.notifyTrialExpiry(trial, daysLeft);
    }
  }

  /**
   * Log module usage
   */
  async logModuleUsage(data) {
    const { tenantId, moduleId, userId, action, entityType, entityId } = data;

    await ModuleUsageLog.create({
      tenantId,
      moduleId,
      userId,
      action,
      entityType,
      entityId,
      timestamp: new Date(),
    });
  }
}

module.exports = new ModuleManagementService();
