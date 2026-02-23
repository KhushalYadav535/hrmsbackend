const CompanyModule = require('../models/CompanyModule');
const Tenant = require('../models/Tenant');
const ModuleActivationRequest = require('../models/ModuleActivationRequest');
const mongoose = require('mongoose');

exports.getAnalytics = async (req, res) => {
  try {
    const tenants = await Tenant.find();
    const companyModules = await CompanyModule.find()
      .populate('moduleId', 'moduleName moduleCode')
      .populate('tenantId', 'name code');
    const requests = await ModuleActivationRequest.find({ status: 'PENDING' });

    const moduleUsage = {};
    companyModules.forEach(cm => {
      const code = cm.moduleId?.moduleCode || 'Unknown';
      if (!moduleUsage[code]) {
        moduleUsage[code] = { count: 0, tenants: [] };
      }
      moduleUsage[code].count++;
      if (cm.tenantId?.name) moduleUsage[code].tenants.push(cm.tenantId.name);
    });

    const tenantStats = tenants.map(t => ({
      id: t._id,
      name: t.name,
      code: t.code,
      employees: t.employees || 0,
      status: t.status,
      activeModules: companyModules.filter(cm => cm.tenantId?.toString() === t._id.toString() && cm.isEnabled).length,
    }));

    res.json({
      success: true,
      data: {
        totalTenants: tenants.length,
        activeTenants: tenants.filter(t => t.status === 'active').length,
        totalModuleActivations: companyModules.filter(cm => cm.isEnabled).length,
        pendingRequests: requests.length,
        moduleUsage: Object.entries(moduleUsage).map(([code, v]) => ({ moduleCode: code, ...v })),
        tenantStats,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
