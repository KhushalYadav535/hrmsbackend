/**
 * Loan Eligibility Utility
 * BRD Requirement: BR-P0-004 - Staff Loans & Advances Module
 * Checks if employee is eligible for a loan type
 */

const Employee = require('../models/Employee');
const EmployeeLoan = require('../models/EmployeeLoan');
const LoanType = require('../models/LoanType');
const { calculateEMI } = require('./emiCalculator');

/**
 * Calculate years of service from joinDate
 * @param {Date} joinDate - Employee join date
 * @returns {number} Years of service (rounded to 2 decimals)
 */
function calculateServiceYears(joinDate) {
  if (!joinDate) return 0;
  
  const today = new Date();
  const join = new Date(joinDate);
  
  const diffTime = Math.abs(today - join);
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  const years = diffDays / 365.25; // Account for leap years
  
  return Math.round(years * 100) / 100; // Round to 2 decimals
}

/**
 * Check if employee is eligible for a loan type
 * @param {Object} employee - Employee object
 * @param {Object} loanType - LoanType object
 * @returns {Object} { eligible: boolean, reason: string }
 */
function checkEligibility(employee, loanType) {
  // Check minimum service years
  const serviceYears = calculateServiceYears(employee.joinDate);
  if (serviceYears < loanType.minServiceYears) {
    return {
      eligible: false,
      reason: `Minimum ${loanType.minServiceYears} year(s) of service required. You have ${serviceYears.toFixed(1)} year(s).`,
    };
  }

  // Check if employee grade is eligible (if specified)
  if (loanType.eligibleGrades && loanType.eligibleGrades.length > 0) {
    if (!loanType.eligibleGrades.includes(employee.designation)) {
      return {
        eligible: false,
        reason: `This loan type is only available for: ${loanType.eligibleGrades.join(', ')}`,
      };
    }
  }

  // Check if loan type is active
  if (!loanType.isActive) {
    return {
      eligible: false,
      reason: 'This loan type is currently not available',
    };
  }

  // Check employee status
  if (employee.status !== 'Active') {
    return {
      eligible: false,
      reason: `Only active employees can apply for loans. Your status is: ${employee.status}`,
    };
  }

  return {
    eligible: true,
    reason: 'Eligible',
  };
}

/**
 * Check EMI affordability (max 50% of take-home salary)
 * @param {number} emiAmount - Monthly EMI amount
 * @param {number} takeHomeSalary - Employee's take-home salary
 * @returns {Object} { affordable: boolean, reason: string }
 */
function checkEMIAffordability(emiAmount, takeHomeSalary) {
  const maxEMI = takeHomeSalary * 0.5; // Max 50% of take-home
  
  if (emiAmount > maxEMI) {
    return {
      affordable: false,
      reason: `EMI (₹${emiAmount.toLocaleString()}) exceeds 50% of take-home salary (₹${takeHomeSalary.toLocaleString()}). Maximum allowed EMI: ₹${maxEMI.toLocaleString()}`,
      maxAllowedEMI: maxEMI,
    };
  }

  return {
    affordable: true,
    reason: 'EMI is affordable',
  };
}

/**
 * Get employee's existing loan obligations
 * @param {ObjectId} employeeId - Employee ID
 * @param {ObjectId} tenantId - Tenant ID
 * @returns {Object} { totalEMI: number, activeLoans: number, loans: Array }
 */
async function getExistingLoanObligations(employeeId, tenantId) {
  const activeLoans = await EmployeeLoan.find({
    tenantId,
    employeeId,
    status: { $in: ['ACTIVE', 'DISBURSED'] },
  }).populate('loanTypeId', 'loanName');

  const totalEMI = activeLoans.reduce((sum, loan) => sum + (loan.emiAmount || 0), 0);

  return {
    totalEMI,
    activeLoans: activeLoans.length,
    loans: activeLoans.map(loan => ({
      loanId: loan._id,
      loanType: loan.loanTypeId?.loanName || 'Unknown',
      emiAmount: loan.emiAmount,
      outstandingAmount: loan.outstandingAmount,
    })),
  };
}

/**
 * Validate loan application
 * @param {Object} employee - Employee object
 * @param {Object} loanType - LoanType object
 * @param {number} appliedAmount - Requested loan amount
 * @param {number} tenureMonths - Requested tenure
 * @param {number} takeHomeSalary - Employee's take-home salary
 * @returns {Object} { valid: boolean, errors: Array, warnings: Array, emiPreview: Object }
 */
async function validateLoanApplication(employee, loanType, appliedAmount, tenureMonths, takeHomeSalary) {
  const errors = [];
  const warnings = [];
  let emiPreview = null;

  // Check eligibility
  const eligibility = checkEligibility(employee, loanType);
  if (!eligibility.eligible) {
    errors.push(eligibility.reason);
    return { valid: false, errors, warnings, emiPreview };
  }

  // Check amount limits
  if (appliedAmount <= 0) {
    errors.push('Loan amount must be greater than 0');
  }
  if (appliedAmount > loanType.maxAmount) {
    errors.push(`Maximum loan amount is ₹${loanType.maxAmount.toLocaleString()}. You requested ₹${appliedAmount.toLocaleString()}`);
  }

  // Check tenure limits
  if (tenureMonths <= 0 || !Number.isInteger(tenureMonths)) {
    errors.push('Tenure must be a positive integer (months)');
  }
  if (tenureMonths > loanType.maxTenureMonths) {
    errors.push(`Maximum tenure is ${loanType.maxTenureMonths} months. You requested ${tenureMonths} months`);
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, emiPreview };
  }

  // Calculate EMI preview
  try {
    emiPreview = calculateEMI(appliedAmount, loanType.interestRatePercent, tenureMonths);
    
    // Check EMI affordability
    if (takeHomeSalary > 0) {
      const affordability = checkEMIAffordability(emiPreview.emiAmount, takeHomeSalary);
      if (!affordability.affordable) {
        errors.push(affordability.reason);
      }
    }

    // Check existing loan obligations
    const existingLoans = await getExistingLoanObligations(employee._id, employee.tenantId);
    if (existingLoans.activeLoans > 0) {
      const totalEMIWithNew = existingLoans.totalEMI + emiPreview.emiAmount;
      if (takeHomeSalary > 0) {
        const totalEMIPercentage = (totalEMIWithNew / takeHomeSalary) * 100;
        if (totalEMIPercentage > 50) {
          warnings.push(`Total EMI (including existing loans) will be ${totalEMIPercentage.toFixed(1)}% of take-home salary. Maximum recommended: 50%`);
        }
      }
    }
  } catch (error) {
    errors.push(`Error calculating EMI: ${error.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    emiPreview,
  };
}

module.exports = {
  calculateServiceYears,
  checkEligibility,
  checkEMIAffordability,
  getExistingLoanObligations,
  validateLoanApplication,
};
