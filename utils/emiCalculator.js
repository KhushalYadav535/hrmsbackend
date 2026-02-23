/**
 * EMI Calculation Utility
 * BRD Requirement: BR-P0-004 - Staff Loans & Advances Module
 * 
 * Formula: EMI = P × r × (1+r)^n / ((1+r)^n - 1)
 * where:
 *   P = principal amount
 *   r = monthly interest rate (annualRate / 12 / 100)
 *   n = tenure in months
 * 
 * Returns: { emiAmount, totalAmount, totalInterest, schedule[] }
 */

/**
 * Calculate EMI for a loan
 * @param {number} principal - Principal amount (sanctioned amount)
 * @param {number} annualInterestRate - Annual interest rate percentage (e.g., 7.5 for 7.5%)
 * @param {number} tenureMonths - Loan tenure in months
 * @returns {Object} { emiAmount, totalAmount, totalInterest, schedule }
 */
function calculateEMI(principal, annualInterestRate, tenureMonths) {
  // Validate inputs
  if (principal <= 0) {
    throw new Error('Principal amount must be greater than 0');
  }
  if (tenureMonths <= 0 || !Number.isInteger(tenureMonths)) {
    throw new Error('Tenure must be a positive integer (months)');
  }
  if (annualInterestRate < 0 || annualInterestRate > 100) {
    throw new Error('Interest rate must be between 0 and 100');
  }

  // Handle zero interest rate (interest-free loans)
  if (annualInterestRate === 0) {
    const emiAmount = Math.round(principal / tenureMonths);
    const totalAmount = emiAmount * tenureMonths;
    const totalInterest = 0;
    
    // Generate schedule for zero interest
    const schedule = [];
    let remainingPrincipal = principal;
    
    for (let i = 1; i <= tenureMonths; i++) {
      const principalComponent = i === tenureMonths 
        ? remainingPrincipal 
        : emiAmount;
      remainingPrincipal -= principalComponent;
      
      schedule.push({
        emiNumber: i,
        principalAmount: principalComponent,
        interestAmount: 0,
        emiAmount: principalComponent,
        outstandingPrincipal: Math.max(0, remainingPrincipal),
      });
    }
    
    return {
      emiAmount,
      totalAmount,
      totalInterest,
      schedule,
    };
  }

  // Calculate monthly interest rate
  const monthlyRate = annualInterestRate / 12 / 100;
  
  // Calculate EMI using formula: EMI = P × r × (1+r)^n / ((1+r)^n - 1)
  const onePlusR = 1 + monthlyRate;
  const onePlusRPowerN = Math.pow(onePlusR, tenureMonths);
  const emiAmount = principal * monthlyRate * onePlusRPowerN / (onePlusRPowerN - 1);
  
  // Round to 2 decimal places
  const roundedEMI = Math.round(emiAmount * 100) / 100;
  
  // Calculate total amount and interest
  const totalAmount = roundedEMI * tenureMonths;
  const totalInterest = totalAmount - principal;
  
  // Generate EMI schedule
  const schedule = [];
  let outstandingPrincipal = principal;
  
  for (let i = 1; i <= tenureMonths; i++) {
    // Interest component for this month
    const interestComponent = outstandingPrincipal * monthlyRate;
    
    // Principal component for this month
    const principalComponent = roundedEMI - interestComponent;
    
    // Update outstanding principal
    outstandingPrincipal -= principalComponent;
    
    // For last EMI, adjust for rounding differences
    if (i === tenureMonths) {
      const adjustedPrincipal = outstandingPrincipal + principalComponent;
      const adjustedEMI = adjustedPrincipal + interestComponent;
      schedule.push({
        emiNumber: i,
        principalAmount: Math.round(adjustedPrincipal * 100) / 100,
        interestAmount: Math.round(interestComponent * 100) / 100,
        emiAmount: Math.round(adjustedEMI * 100) / 100,
        outstandingPrincipal: 0,
      });
    } else {
      schedule.push({
        emiNumber: i,
        principalAmount: Math.round(principalComponent * 100) / 100,
        interestAmount: Math.round(interestComponent * 100) / 100,
        emiAmount: roundedEMI,
        outstandingPrincipal: Math.max(0, Math.round(outstandingPrincipal * 100) / 100),
      });
    }
  }
  
  return {
    emiAmount: roundedEMI,
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalInterest: Math.round(totalInterest * 100) / 100,
    schedule,
  };
}

/**
 * Calculate EMI with start date (for schedule generation with actual dates)
 * @param {number} principal - Principal amount
 * @param {number} annualInterestRate - Annual interest rate percentage
 * @param {number} tenureMonths - Loan tenure in months
 * @param {Date} startDate - Loan start date (disbursal date)
 * @returns {Object} { emiAmount, totalAmount, totalInterest, schedule[] } with dueDate
 */
function calculateEMIWithDates(principal, annualInterestRate, tenureMonths, startDate) {
  const result = calculateEMI(principal, annualInterestRate, tenureMonths);
  
  // Add due dates to schedule
  const scheduleWithDates = result.schedule.map((emi, index) => {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + index);
    
    return {
      ...emi,
      dueDate,
    };
  });
  
  return {
    ...result,
    schedule: scheduleWithDates,
  };
}

module.exports = {
  calculateEMI,
  calculateEMIWithDates,
};
