const RolePermission = require('../models/RolePermission');
const AuditLog = require('../models/AuditLog');

// Default permissions for each role
const defaultRolePermissions = {
  'Super Admin': [
    'manage_all', 'view_all', 'configure_all', 'delete_all',
    'manage_employees', 'view_all_reports', 'manage_policies', 'manage_onboarding',
    'manage_recruitment', 'view_payroll_reports', 'approve_leave', 'approve_expense',
    'approve_appraisal', 'view_team', 'manage_finance', 'view_financial_reports',
    'manage_departments', 'manage_designations', 'view_audit_logs',
    'configure_system', 'manage_users', 'manage_roles', 'manage_integrations',
    'manage_settings', 'manage_sms', 'manage_whatsapp', 'system_maintenance',
    'process_payroll', 'manage_compliance', 'view_payslip', 'generate_form16',
    'generate_form24q', 'manage_epfo', 'manage_esic', 'generate_bank_files',
    'view_employee_salary', 'manage_budget', 'reconcile_accounts',
    'approve_travel', 'view_reports', 'approve_team_payslip', 'manage_team_goals',
    'apply_leave', 'submit_expense', 'view_profile', 'view_tax', 'view_attendance',
    'submit_appraisal', 'view_own_data', 'export_reports', 'view_employee_data',
  ],
  'Tenant Admin': [
    'manage_employees', 'view_all_reports', 'manage_policies', 'manage_onboarding',
    'manage_recruitment', 'view_payroll_reports', 'approve_leave', 'approve_expense',
    'approve_appraisal', 'view_team', 'manage_finance', 'view_financial_reports',
    'manage_departments', 'manage_designations', 'view_audit_logs',
    'configure_system', 'manage_users', 'manage_roles', 'manage_integrations',
    'manage_settings', 'manage_sms', 'manage_whatsapp', 'system_maintenance',
  ],
  'HR Administrator': [
    'manage_employees', 'configure_system', 'view_all_reports', 'manage_policies',
    'manage_onboarding', 'manage_recruitment', 'approve_leave', 'approve_expense',
    'view_team', 'manage_departments', 'manage_designations', 'view_audit_logs',
    'manage_users', 'manage_roles',
  ],
  'Payroll Administrator': [
    'process_payroll', 'manage_compliance', 'view_payroll_reports', 'view_payslip',
    'generate_form16', 'generate_form24q', 'manage_epfo', 'manage_esic',
    'generate_bank_files', 'view_employee_salary',
  ],
  'Finance Administrator': [
    'view_financial_reports', 'approve_expense', 'manage_budget',
    'reconcile_accounts', 'view_audit_logs', 'manage_finance',
  ],
  'Manager': [
    'approve_leave', 'approve_expense', 'approve_travel', 'view_team',
    'view_reports', 'approve_appraisal', 'view_team_payslip', 'manage_team_goals',
  ],
  'Employee': [
    'view_payslip', 'apply_leave', 'submit_expense', 'view_profile',
    'view_tax', 'view_attendance', 'submit_appraisal', 'view_own_data',
  ],
  'Auditor': [
    'view_all_reports', 'view_audit_logs', 'view_financial_reports',
    'view_payroll_reports', 'view_employee_data', 'export_reports',
  ],
};

// All available permissions
const allPermissions = [
  'manage_employees', 'view_all_reports', 'manage_policies', 'manage_onboarding',
  'manage_recruitment', 'view_payroll_reports', 'approve_leave', 'approve_expense',
  'approve_appraisal', 'view_team', 'manage_finance', 'view_financial_reports',
  'manage_departments', 'manage_designations', 'view_audit_logs',
  'configure_system', 'manage_users', 'manage_roles', 'manage_integrations',
  'manage_settings', 'manage_sms', 'manage_whatsapp', 'system_maintenance',
  'process_payroll', 'manage_compliance', 'view_payslip', 'generate_form16',
  'generate_form24q', 'manage_epfo', 'manage_esic', 'generate_bank_files',
  'view_employee_salary', 'manage_budget', 'reconcile_accounts',
  'approve_travel', 'view_reports', 'view_team_payslip', 'manage_team_goals',
  'apply_leave', 'submit_expense', 'view_profile', 'view_tax', 'view_attendance',
  'submit_appraisal', 'view_own_data', 'export_reports', 'view_employee_data',
  'manage_all', 'view_all', 'configure_all', 'delete_all',
];

// @desc    Get all role permissions
// @route   GET /api/role-permissions
// @access  Private (Tenant Admin, HR Administrator, System Administrator)
exports.getRolePermissions = async (req, res) => {
  try {
    let rolePermissions = await RolePermission.find({ tenantId: req.tenantId }).sort({ role: 1 });

    // If no role permissions exist, initialize with defaults
    if (rolePermissions.length === 0) {
      const roles = Object.keys(defaultRolePermissions);
      const permissionsToCreate = roles.map(role => ({
        tenantId: req.tenantId,
        role,
        permissions: defaultRolePermissions[role],
        status: 'Active',
      }));

      rolePermissions = await RolePermission.insertMany(permissionsToCreate);
    }

    res.status(200).json({
      success: true,
      count: rolePermissions.length,
      data: rolePermissions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get permissions for a specific role
// @route   GET /api/role-permissions/:role
// @access  Private
exports.getRolePermission = async (req, res) => {
  try {
    let rolePermission = await RolePermission.findOne({
      tenantId: req.tenantId,
      role: req.params.role,
    });

    // If role permission doesn't exist, create with defaults
    if (!rolePermission && defaultRolePermissions[req.params.role]) {
      rolePermission = await RolePermission.create({
        tenantId: req.tenantId,
        role: req.params.role,
        permissions: defaultRolePermissions[req.params.role],
        status: 'Active',
      });
    }

    if (!rolePermission) {
      return res.status(404).json({
        success: false,
        message: 'Role permission not found',
      });
    }

    res.status(200).json({
      success: true,
      data: rolePermission,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update role permissions
// @route   PUT /api/role-permissions/:role
// @access  Private (Tenant Admin only)
exports.updateRolePermissions = async (req, res) => {
  try {
    const { permissions, status } = req.body;

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'Permissions array is required',
      });
    }

    let rolePermission = await RolePermission.findOne({
      tenantId: req.tenantId,
      role: req.params.role,
    });

    if (!rolePermission) {
      // Create new role permission if it doesn't exist
      rolePermission = await RolePermission.create({
        tenantId: req.tenantId,
        role: req.params.role,
        permissions: permissions,
        status: status || 'Active',
      });
    } else {
      rolePermission.permissions = permissions;
      if (status) rolePermission.status = status;
      await rolePermission.save();
    }

    // Create audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Update',
        module: 'Permissions',
        entityType: 'Role Permission',
        entityId: rolePermission._id,
        details: `Updated permissions for role: ${req.params.role}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
        changes: `Permissions updated: ${permissions.length} permissions assigned`,
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(200).json({
      success: true,
      data: rolePermission,
      message: 'Role permissions updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get all available permissions
// @route   GET /api/role-permissions/available/list
// @access  Private
exports.getAvailablePermissions = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: allPermissions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
