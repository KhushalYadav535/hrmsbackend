/**
 * Tax Calculation Service
 * BRD Requirement: BR-TAX-001 to BR-TAX-014
 * Handles all tax calculations including TDS, HRA exemption, regime comparison
 */

/**
 * Calculate HRA exemption as per Income Tax rules
 * Least of: (a) Actual HRA, (b) 50%/40% of basic, (c) Rent - 10% of basic
 */
function calculateHRAExemption(actualHRA, basicSalary, monthlyRent, isMetro) {
  const percentageOfBasic = isMetro ? basicSalary * 0.5 : basicSalary * 0.4;
  const rentMinus10PercentBasic = monthlyRent - (basicSalary * 0.1);
  
  return Math.min(
    actualHRA,
    percentageOfBasic,
    Math.max(0, rentMinus10PercentBasic)
  );
}

/**
 * Calculate tax under Old Regime
 */
function calculateOldRegimeTax(taxableIncome, deductions = {}) {
  let tax = 0;
  
  // Apply tax slabs (FY 2024-25)
  if (taxableIncome > 1500000) {
    tax = 187500 + (taxableIncome - 1500000) * 0.30;
  } else if (taxableIncome > 1250000) {
    tax = 125000 + (taxableIncome - 1250000) * 0.25;
  } else if (taxableIncome > 1000000) {
    tax = 75000 + (taxableIncome - 1000000) * 0.20;
  } else if (taxableIncome > 500000) {
    tax = 12500 + (taxableIncome - 500000) * 0.10;
  } else if (taxableIncome > 250000) {
    tax = (taxableIncome - 250000) * 0.05;
  }
  
  // Section 87A rebate (if income <= ₹5 lakh)
  if (taxableIncome <= 500000) {
    tax = Math.max(0, tax - 12500);
  }
  
  // Add 4% cess
  const cess = tax * 0.04;
  
  return {
    tax,
    cess,
    totalTax: tax + cess,
  };
}

/**
 * Calculate tax under New Regime
 */
function calculateNewRegimeTax(taxableIncome) {
  let tax = 0;
  
  // Apply tax slabs (FY 2024-25 - New Regime)
  if (taxableIncome > 1500000) {
    tax = 150000 + (taxableIncome - 1500000) * 0.30;
  } else if (taxableIncome > 1200000) {
    tax = 90000 + (taxableIncome - 1200000) * 0.20;
  } else if (taxableIncome > 900000) {
    tax = 45000 + (taxableIncome - 900000) * 0.15;
  } else if (taxableIncome > 700000) {
    tax = 30000 + (taxableIncome - 700000) * 0.10;
  } else if (taxableIncome > 500000) {
    tax = 12500 + (taxableIncome - 500000) * 0.05;
  }
  
  // Section 87A rebate (if income <= ₹7 lakh)
  if (taxableIncome <= 700000) {
    tax = Math.max(0, tax - 25000);
  }
  
  // Add 4% cess
  const cess = tax * 0.04;
  
  return {
    tax,
    cess,
    totalTax: tax + cess,
  };
}

/**
 * Calculate taxable income
 */
function calculateTaxableIncome(grossSalary, exemptions, deductions, standardDeduction = 50000) {
  const totalExemptions = exemptions.hraExemption + exemptions.ltaExemption + (exemptions.otherExemptions || 0);
  const totalDeductions = deductions.section80C + deductions.section80D + deductions.section80E + 
                         deductions.section80G + deductions.section80CCD + (deductions.otherDeductions || 0);
  
  return Math.max(0, grossSalary - totalExemptions - standardDeduction - totalDeductions);
}

/**
 * Compare tax regimes and recommend optimal
 */
function compareTaxRegimes(grossSalary, exemptions, deductions, standardDeduction = 50000) {
  const taxableIncomeOld = calculateTaxableIncome(grossSalary, exemptions, deductions, standardDeduction);
  const taxableIncomeNew = Math.max(0, grossSalary - standardDeduction); // New regime has limited deductions
  
  const oldRegimeTax = calculateOldRegimeTax(taxableIncomeOld, deductions);
  const newRegimeTax = calculateNewRegimeTax(taxableIncomeNew);
  
  const taxSavings = oldRegimeTax.totalTax - newRegimeTax.totalTax;
  const recommendedRegime = taxSavings > 0 ? 'New' : 'Old';
  
  return {
    oldRegime: {
      taxableIncome: taxableIncomeOld,
      tax: oldRegimeTax.tax,
      cess: oldRegimeTax.cess,
      totalTax: oldRegimeTax.totalTax,
    },
    newRegime: {
      taxableIncome: taxableIncomeNew,
      tax: newRegimeTax.tax,
      cess: newRegimeTax.cess,
      totalTax: newRegimeTax.totalTax,
    },
    taxSavings: Math.abs(taxSavings),
    recommendedRegime,
    recommendationReason: taxSavings > 0 
      ? `New regime saves ₹${Math.abs(taxSavings).toFixed(2)}`
      : `Old regime saves ₹${Math.abs(taxSavings).toFixed(2)}`,
  };
}

/**
 * Calculate monthly TDS based on projected annual income
 */
function calculateMonthlyTDS(projectedAnnualIncome, regime, exemptions, deductions, monthsRemaining, previousTds = 0) {
  const standardDeduction = 50000;
  const taxableIncome = calculateTaxableIncome(projectedAnnualIncome, exemptions, deductions, standardDeduction);
  
  let annualTax;
  if (regime === 'Old') {
    annualTax = calculateOldRegimeTax(taxableIncome, deductions).totalTax;
  } else {
    annualTax = calculateNewRegimeTax(taxableIncome).totalTax;
  }
  
  const remainingTax = Math.max(0, annualTax - previousTds);
  const monthlyTds = monthsRemaining > 0 ? remainingTax / monthsRemaining : 0;
  
  return {
    projectedAnnualIncome,
    taxableIncome,
    annualTax,
    previousTds,
    remainingTax,
    monthlyTds: Math.round(monthlyTds),
    monthsRemaining,
  };
}

/**
 * Adjust TDS for bonuses and arrears
 */
function adjustTDSForBonus(currentTds, bonusAmount, annualIncome, regime, exemptions, deductions) {
  const adjustedAnnualIncome = annualIncome + bonusAmount;
  const standardDeduction = 50000;
  const taxableIncome = calculateTaxableIncome(adjustedAnnualIncome, exemptions, deductions, standardDeduction);
  
  let annualTax;
  if (regime === 'Old') {
    annualTax = calculateOldRegimeTax(taxableIncome, deductions).totalTax;
  } else {
    annualTax = calculateNewRegimeTax(taxableIncome).totalTax;
  }
  
  const additionalTds = Math.max(0, annualTax - (currentTds * 12));
  
  return {
    adjustedAnnualIncome,
    taxableIncome,
    annualTax,
    additionalTds: Math.round(additionalTds),
    recommendedTds: Math.round(annualTax / 12),
  };
}

module.exports = {
  calculateHRAExemption,
  calculateOldRegimeTax,
  calculateNewRegimeTax,
  calculateTaxableIncome,
  compareTaxRegimes,
  calculateMonthlyTDS,
  adjustTDSForBonus,
};
