/**
 * Full & Final (F&F) Settlement Calculator
 * Pure functions for calculating F&F components
 * BRD: BR-P0-005
 * Business Logic: HRMS-PAY-005
 */

/**
 * Calculate Gratuity
 * Formula: Gratuity = (Basic + DA) × 15/26 × completedYearsOfService
 * Rules:
 * - Only if service >= 5 years
 * - Max ₹20,00,000 as per Gratuity Act
 * - Round service years: if (days % 365) >= 240, round up; else round down
 * 
 * @param {Number} basicSalary - Basic salary
 * @param {Number} daAmount - DA (Dearness Allowance)
 * @param {Number} serviceYears - Years of service (can be decimal)
 * @param {Number} serviceDays - Optional: Total service days (for accurate rounding)
 * @returns {Object} { gratuityAmount, gratuityYears, isEligible }
 */
function calculateGratuity(basicSalary, daAmount, serviceYears, serviceDays = null) {
  const MIN_SERVICE_YEARS = 5;
  const MAX_GRATUITY = 2000000; // ₹20L cap
  const GRATUITY_MULTIPLIER = 15 / 26;

  if (serviceYears < MIN_SERVICE_YEARS) {
    return {
      gratuityAmount: 0,
      gratuityYears: 0,
      isEligible: false,
    };
  }

  // Round service years based on days
  let roundedYears;
  if (serviceDays !== null) {
    // Use actual service days for accurate rounding
    const fullYears = Math.floor(serviceDays / 365);
    const remainingDays = serviceDays % 365;
    roundedYears = remainingDays >= 240 ? Math.ceil(serviceDays / 365) : Math.floor(serviceDays / 365);
  } else {
    // Fallback: calculate from serviceYears
    const fullYears = Math.floor(serviceYears);
    const remainingDays = (serviceYears - fullYears) * 365.25; // Use 365.25 for accuracy
    roundedYears = remainingDays >= 240 ? Math.ceil(serviceYears) : Math.floor(serviceYears);
  }

  const wages = basicSalary + daAmount;
  let gratuityAmount = (wages * GRATUITY_MULTIPLIER * roundedYears);
  
  // Apply ₹20L cap
  gratuityAmount = Math.min(gratuityAmount, MAX_GRATUITY);
  gratuityAmount = Math.round(gratuityAmount);

  return {
    gratuityAmount,
    gratuityYears: roundedYears,
    isEligible: true,
  };
}

/**
 * Calculate Leave Encashment
 * Formula: Leave Encashment = (Basic + DA) / 26 × eligibleLeaveDays
 * Rules:
 * - Max 30 days encashable as per bank policy
 * - Fully taxable
 * 
 * @param {Number} basicSalary - Basic salary
 * @param {Number} daAmount - DA (Dearness Allowance)
 * @param {Number} plBalance - PL (Privilege Leave) balance
 * @param {Number} clBalance - CL (Casual Leave) balance
 * @param {Number} maxEncashableDays - Max days encashable (default: 30)
 * @returns {Object} { leaveEncashmentDays, leaveEncashmentAmount, perDaySalary }
 */
function calculateLeaveEncashment(basicSalary, daAmount, plBalance, clBalance, maxEncashableDays = 30) {
  const totalLeave = (plBalance || 0) + (clBalance || 0);
  const encashableDays = Math.min(totalLeave, maxEncashableDays);

  const perDaySalary = (basicSalary + daAmount) / 26;
  const leaveEncashmentAmount = Math.round(perDaySalary * encashableDays);

  return {
    leaveEncashmentDays: encashableDays,
    leaveEncashmentAmount,
    perDaySalary: Math.round(perDaySalary * 100) / 100, // Round to 2 decimals
  };
}

/**
 * Calculate Notice Period Recovery
 * Formula: Notice Period Recovery = (Gross / 30) × shortfallDays
 * Rules:
 * - Only if employee does not serve full notice period
 * - Shortfall = requiredNotice - actualNotice
 * 
 * @param {Number} grossSalary - Gross salary
 * @param {Number} requiredNoticeDays - Required notice period in days
 * @param {Number} actualNoticeDays - Actual notice period served in days
 * @param {Boolean} noticePeriodWaived - Whether notice period was waived
 * @returns {Object} { recoveryDays, recoveryAmount, perDaySalary }
 */
function calculateNoticePeriodRecovery(grossSalary, requiredNoticeDays, actualNoticeDays, noticePeriodWaived = false) {
  if (noticePeriodWaived) {
    return {
      recoveryDays: 0,
      recoveryAmount: 0,
      perDaySalary: grossSalary / 30,
    };
  }

  const shortfall = requiredNoticeDays - actualNoticeDays;
  const recoveryDays = Math.max(0, shortfall);

  if (recoveryDays === 0) {
    return {
      recoveryDays: 0,
      recoveryAmount: 0,
      perDaySalary: grossSalary / 30,
    };
  }

  const perDaySalary = grossSalary / 30;
  const recoveryAmount = Math.round(perDaySalary * recoveryDays);

  return {
    recoveryDays,
    recoveryAmount,
    perDaySalary: Math.round(perDaySalary * 100) / 100,
  };
}

/**
 * Calculate Partial Month Salary
 * Formula: Salary = (Gross / 26) × daysWorked
 * 
 * @param {Number} grossSalary - Gross salary
 * @param {Number} daysWorked - Number of days worked in the month
 * @returns {Object} { salaryAmount, perDaySalary }
 */
function calculatePartialMonthSalary(grossSalary, daysWorked) {
  const perDaySalary = grossSalary / 26;
  const salaryAmount = Math.round(perDaySalary * daysWorked);

  return {
    salaryAmount,
    perDaySalary: Math.round(perDaySalary * 100) / 100,
  };
}

/**
 * Calculate Service Years from joining date to last working date
 * 
 * @param {Date} joiningDate - Employee joining date
 * @param {Date} lastWorkingDate - Last working date
 * @returns {Object} { serviceYears, serviceDays, fullYears, remainingDays }
 */
function calculateServiceYears(joiningDate, lastWorkingDate) {
  const start = new Date(joiningDate);
  const end = new Date(lastWorkingDate);
  
  // Set to start of day for accurate calculation
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const serviceYears = diffDays / 365.25; // Account for leap years
  const fullYears = Math.floor(serviceYears);
  const remainingDays = diffDays % 365;

  return {
    serviceYears: Math.round(serviceYears * 100) / 100, // Round to 2 decimals
    serviceDays: diffDays,
    fullYears,
    remainingDays,
  };
}

/**
 * Comprehensive F&F Calculation
 * Calculates all components of Full & Final settlement
 * 
 * @param {Object} employeeData - Employee data
 * @param {Object} employeeData.basicSalary - Basic salary
 * @param {Object} employeeData.daAmount - DA amount
 * @param {Object} employeeData.grossSalary - Gross salary
 * @param {Object} employeeData.joiningDate - Joining date
 * @param {Object} employeeData.plBalance - PL balance
 * @param {Object} employeeData.clBalance - CL balance
 * @param {Object} separationData - Separation data
 * @param {Object} separationData.lastWorkingDate - Last working date
 * @param {Object} separationData.resignationDate - Resignation date
 * @param {Object} separationData.noticePeriodDays - Required notice period
 * @param {Object} separationData.noticePeriodServedDays - Actual notice served
 * @param {Object} separationData.noticePeriodWaived - Whether notice waived
 * @param {Object} separationData.lastSalaryMonth - Last salary month (1-12)
 * @param {Object} separationData.lastSalaryYear - Last salary year
 * @param {Object} financialData - Financial data
 * @param {Object} financialData.loanOutstanding - Outstanding loan amount
 * @param {Object} financialData.advanceOutstanding - Outstanding advance amount
 * @param {Object} financialData.bonusAmount - Pending bonus
 * @param {Object} financialData.pfContribution - PF contribution refund
 * @returns {Object} Complete F&F breakdown
 */
function calculateFullAndFinal(employeeData, separationData, financialData = {}) {
  const {
    basicSalary,
    daAmount,
    grossSalary,
    joiningDate,
    plBalance = 0,
    clBalance = 0,
  } = employeeData;

  const {
    lastWorkingDate,
    resignationDate,
    noticePeriodDays,
    noticePeriodServedDays,
    noticePeriodWaived,
    lastSalaryMonth,
    lastSalaryYear,
  } = separationData;

  const {
    loanOutstanding = 0,
    advanceOutstanding = 0,
    bonusAmount = 0,
    pfContribution = 0,
  } = financialData;

  // Calculate service years
  const serviceInfo = calculateServiceYears(joiningDate, lastWorkingDate);

  // Calculate gratuity (pass serviceDays for accurate rounding)
  const gratuity = calculateGratuity(basicSalary, daAmount, serviceInfo.serviceYears, serviceInfo.serviceDays);

  // Calculate leave encashment
  const leaveEncashment = calculateLeaveEncashment(basicSalary, daAmount, plBalance, clBalance);

  // Calculate notice period recovery
  const noticeRecovery = calculateNoticePeriodRecovery(
    grossSalary,
    noticePeriodDays,
    noticePeriodServedDays,
    noticePeriodWaived
  );

  // Calculate partial month salary
  // Get days worked in last month
  const lastWorkingDateObj = new Date(lastWorkingDate);
  const daysWorked = lastWorkingDateObj.getDate(); // Days worked in the month
  const partialSalary = calculatePartialMonthSalary(grossSalary, daysWorked);

  // Calculate earnings
  const totalEarnings = Math.round(
    partialSalary.salaryAmount +
    leaveEncashment.leaveEncashmentAmount +
    gratuity.gratuityAmount +
    bonusAmount +
    pfContribution
  );

  // Calculate deductions
  const totalDeductions = Math.round(
    noticeRecovery.recoveryAmount +
    loanOutstanding +
    advanceOutstanding
  );

  // Net payable
  const netPayable = totalEarnings - totalDeductions;

  return {
    // Earnings
    salaryDaysPayable: daysWorked,
    basicPerDay: Math.round((basicSalary / 26) * 100) / 100,
    salaryAmount: partialSalary.salaryAmount,
    leaveEncashmentDays: leaveEncashment.leaveEncashmentDays,
    leaveEncashmentAmount: leaveEncashment.leaveEncashmentAmount,
    gratuityAmount: gratuity.gratuityAmount,
    gratuityYears: gratuity.gratuityYears,
    gratuityEligible: gratuity.isEligible,
    bonusAmount: bonusAmount,
    pfContributionAmount: pfContribution,
    totalEarnings,

    // Deductions
    noticePeriodRecoveryDays: noticeRecovery.recoveryDays,
    noticePeriodRecoveryAmount: noticeRecovery.recoveryAmount,
    loanOutstandingRecovery: loanOutstanding,
    advanceRecovery: advanceOutstanding,
    otherDeductions: 0, // Can be extended
    totalDeductions,

    // Net
    netPayable,

    // Metadata
    serviceYears: serviceInfo.serviceYears,
    serviceDays: serviceInfo.serviceDays,
    calculationDate: new Date(),
  };
}

module.exports = {
  calculateGratuity,
  calculateLeaveEncashment,
  calculateNoticePeriodRecovery,
  calculatePartialMonthSalary,
  calculateServiceYears,
  calculateFullAndFinal,
};
