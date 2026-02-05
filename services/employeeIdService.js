/**
 * Employee ID Generation Service
 * BRD Requirement: BR-ONB-008
 * Automatic employee ID generation
 */

const Employee = require('../models/Employee');

/**
 * Generate unique employee ID
 * Format: [TENANT_CODE][YEAR][SEQUENCE]
 * Example: IND20260001
 */
async function generateEmployeeId(tenantId, department = null) {
  try {
    // Get tenant code (first 3 letters of tenant name or default)
    const Tenant = require('../models/Tenant');
    const tenant = await Tenant.findById(tenantId);
    const tenantCode = tenant?.code?.substring(0, 3).toUpperCase() || 'IND';
    
    // Get current year (last 2 digits)
    const year = new Date().getFullYear().toString().substring(2);
    
    // Get department code if provided
    let deptCode = '';
    if (department) {
      const Department = require('../models/Department');
      const dept = await Department.findOne({ name: department, tenantId });
      if (dept && dept.code) {
        deptCode = dept.code.substring(0, 2).toUpperCase();
      }
    }
    
    // Find the last employee ID for this tenant and year
    const lastEmployee = await Employee.findOne({
      tenantId,
      employeeCode: new RegExp(`^${tenantCode}${year}`),
    })
      .sort({ employeeCode: -1 })
      .select('employeeCode');
    
    let sequence = 1;
    if (lastEmployee && lastEmployee.employeeCode) {
      // Extract sequence number from last employee code
      const lastSequence = parseInt(lastEmployee.employeeCode.substring(tenantCode.length + year.length + deptCode.length)) || 0;
      sequence = lastSequence + 1;
    }
    
    // Format: TENANTCODE + YEAR + DEPTCODE + SEQUENCE (4 digits)
    const employeeCode = `${tenantCode}${year}${deptCode}${sequence.toString().padStart(4, '0')}`;
    
    // Verify uniqueness
    const exists = await Employee.findOne({ tenantId, employeeCode });
    if (exists) {
      // If exists, increment and try again
      return generateEmployeeId(tenantId, department);
    }
    
    return employeeCode;
  } catch (error) {
    console.error('Error generating employee ID:', error);
    // Fallback: Generate random ID
    const year = new Date().getFullYear().toString().substring(2);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `EMP${year}${random}`;
  }
}

/**
 * Generate portal access token for candidate
 */
function generatePortalToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate temporary password for portal access
 */
function generateTemporaryPassword() {
  const crypto = require('crypto');
  // Generate 12-character password with uppercase, lowercase, numbers
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

module.exports = {
  generateEmployeeId,
  generatePortalToken,
  generateTemporaryPassword,
};
