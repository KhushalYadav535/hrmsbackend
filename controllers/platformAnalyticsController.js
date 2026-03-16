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

// US-A8-01: Export Analytics Reports
exports.exportAnalytics = async (req, res) => {
  try {
    const { format = 'csv', timeRange = '30D', filters = {} } = req.query;
    
    // Get analytics data
    const tenants = await Tenant.find();
    const companyModules = await CompanyModule.find()
      .populate('moduleId', 'moduleName moduleCode')
      .populate('tenantId', 'name code');
    
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
      name: t.name,
      code: t.code,
      employees: t.employees || 0,
      status: t.status,
      activeModules: companyModules.filter(cm => cm.tenantId?.toString() === t._id.toString() && cm.isEnabled).length,
    }));

    // BR-A8-01: Log export for compliance
    const AuditLog = require('../models/AuditLog');
    await AuditLog.create({
      tenantId: null,
      userId: req.user?._id,
      userName: req.user?.name || 'Super Admin',
      userEmail: req.user?.email,
      action: 'Export',
      module: 'Analytics',
      entityType: 'Analytics Report',
      details: `Exported analytics report as ${format.toUpperCase()}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    if (format === 'csv') {
      // Generate CSV manually (no external dependencies)
      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const rows = [
        ['Report Type', 'Analytics Report'],
        ['Generated', new Date().toISOString()],
        ['Time Range', timeRange],
        [],
        ['Tenant Statistics'],
        ['Name', 'Code', 'Employees', 'Status', 'Active Modules'],
        ...tenantStats.map(t => [t.name, t.code, t.employees, t.status, t.activeModules]),
        [],
        ['Module Usage'],
        ['Module Code', 'Tenant Count'],
        ...Object.entries(moduleUsage).map(([code, v]) => [code, v.count]),
      ];
      
      const csvContent = rows.map(row => row.map(escapeCSV).join(',')).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csvContent);
    } else {
      // PDF export (simplified - would use PDF library in production)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${new Date().toISOString().split('T')[0]}.pdf`);
      res.send('PDF export not fully implemented - use CSV export');
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
