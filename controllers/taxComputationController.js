const TaxComputation = require('../models/TaxComputation');
const TaxDeclaration = require('../models/TaxDeclaration');
const TaxRegimeSelection = require('../models/TaxRegimeSelection');
const PreviousEmployerIncome = require('../models/PreviousEmployerIncome');
const HRADeclaration = require('../models/HRADeclaration');
const Employee = require('../models/Employee');
const Payroll = require('../models/Payroll');
const { calculateMonthlyTDS, calculateTaxableIncome, calculateOldRegimeTax, calculateNewRegimeTax } = require('../services/taxCalculationService');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { createAuditLog } = require('../utils/auditLog');

/**
 * Get tax computation for employee
 * BRD: BR-TAX-012
 */
exports.getTaxComputation = asyncHandler(async (req, res) => {
  const { financialYear } = req.query;
  const currentFY = financialYear || getCurrentFinancialYear();
  
  const employee = await Employee.findOne({ 
    email: req.user.email,
    tenantId: req.tenantId 
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found',
    });
  }

  let computation = await TaxComputation.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  // If not exists, create initial computation
  if (!computation) {
    computation = await createInitialComputation(req.tenantId, employee._id, currentFY);
  }

  res.status(200).json({
    success: true,
    data: computation,
  });
});

/**
 * Calculate and update monthly TDS
 * BRD: BR-TAX-004
 */
exports.calculateMonthlyTDS = asyncHandler(async (req, res) => {
  const { month, year } = req.body;
  const currentFY = getCurrentFinancialYear();
  
  const employee = await Employee.findOne({ 
    email: req.user.email,
    tenantId: req.tenantId 
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found',
    });
  }

  // Get payroll data for the month
  const payroll = await Payroll.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    month,
    year,
  });

  if (!payroll) {
    return res.status(404).json({
      success: false,
      message: 'Payroll data not found for this month',
    });
  }

  // Get tax declaration
  const taxDeclaration = await TaxDeclaration.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  // Get regime selection
  const regimeSelection = await TaxRegimeSelection.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  const regime = regimeSelection?.regime || 'New';

  // Get HRA declaration
  const hraDeclaration = await HRADeclaration.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  // Get previous employer income
  const previousIncome = await PreviousEmployerIncome.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  // Calculate exemptions
  const exemptions = {
    hraExemption: hraDeclaration?.calculatedExemption?.exemptionAmount || 0,
    ltaExemption: 0, // TODO: Get from LTA module
    otherExemptions: 0,
  };

  // Calculate deductions from tax declaration
  const deductions = {
    section80C: 0,
    section80D: 0,
    section80E: 0,
    section80G: 0,
    section80CCD: 0,
    otherDeductions: 0,
  };

  if (taxDeclaration) {
    taxDeclaration.declarations.forEach(dec => {
      if (dec.status === 'Approved') {
        switch (dec.section) {
          case '80C':
            deductions.section80C += dec.amount;
            break;
          case '80D':
            deductions.section80D += dec.amount;
            break;
          case '80E':
            deductions.section80E += dec.amount;
            break;
          case '80G':
            deductions.section80G += dec.amount;
            break;
          case '80CCD':
            deductions.section80CCD += dec.amount;
            break;
          default:
            deductions.otherDeductions += dec.amount;
        }
      }
    });
  }

  // Project annual income
  const monthlyGross = payroll.grossSalary || 0;
  const projectedAnnualIncome = monthlyGross * 12 + (previousIncome?.grossSalary || 0);

  // Get existing computation
  let computation = await TaxComputation.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  if (!computation) {
    computation = await createInitialComputation(req.tenantId, employee._id, currentFY);
  }

  // Calculate months remaining
  const currentMonth = new Date().getMonth();
  const monthsRemaining = 12 - currentMonth;

  // Calculate TDS
  const previousTds = computation.cumulativeTdsDeducted || 0;
  const tdsCalculation = calculateMonthlyTDS(
    projectedAnnualIncome,
    regime,
    exemptions,
    deductions,
    monthsRemaining,
    previousTds
  );

  // Update or create monthly computation
  const monthIndex = computation.monthlyComputations.findIndex(
    m => m.month === month && m.year === year
  );

  const monthlyComputation = {
    month,
    year,
    basicSalary: payroll.basicSalary || 0,
    hra: payroll.hra || 0,
    otherAllowances: (payroll.grossSalary || 0) - (payroll.basicSalary || 0) - (payroll.hra || 0),
    grossSalary: monthlyGross,
    hraExemption: exemptions.hraExemption,
    standardDeduction: 50000,
    section80C: deductions.section80C,
    section80D: deductions.section80D,
    section80E: deductions.section80E,
    section80G: deductions.section80G,
    section80CCD: deductions.section80CCD,
    otherDeductions: deductions.otherDeductions,
    totalDeductions: Object.values(deductions).reduce((a, b) => a + b, 0),
    taxableIncome: tdsCalculation.taxableIncome / 12,
    projectedAnnualIncome,
    projectedAnnualTax: tdsCalculation.annualTax,
    tdsDeducted: tdsCalculation.monthlyTds,
    cumulativeTaxableIncome: (computation.cumulativeTaxableIncome || 0) + (tdsCalculation.taxableIncome / 12),
    cumulativeTdsDeducted: previousTds + tdsCalculation.monthlyTds,
  };

  if (monthIndex >= 0) {
    computation.monthlyComputations[monthIndex] = monthlyComputation;
  } else {
    computation.monthlyComputations.push(monthlyComputation);
  }

  // Update annual totals
  computation.annualGrossSalary = projectedAnnualIncome;
  computation.annualTdsDeducted = computation.cumulativeTdsDeducted;
  computation.status = 'Active';

  await computation.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Update',
    entityType: 'TaxComputation',
    entityId: computation._id,
    description: `Monthly TDS calculated for ${month} ${year}`,
  });

  res.status(200).json({
    success: true,
    data: computation,
    tdsCalculation,
  });
});

/**
 * Get tax computation sheet
 * BRD: BR-TAX-012
 */
exports.getTaxComputationSheet = asyncHandler(async (req, res) => {
  const { financialYear } = req.query;
  const currentFY = financialYear || getCurrentFinancialYear();
  
  const employee = await Employee.findOne({ 
    email: req.user.email,
    tenantId: req.tenantId 
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found',
    });
  }

  const computation = await TaxComputation.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  if (!computation) {
    return res.status(404).json({
      success: false,
      message: 'Tax computation not found',
    });
  }

  res.status(200).json({
    success: true,
    data: computation,
  });
});

/**
 * Helper: Create initial tax computation
 */
async function createInitialComputation(tenantId, employeeId, financialYear) {
  const regimeSelection = await TaxRegimeSelection.findOne({
    tenantId,
    employeeId,
    financialYear,
  });

  return await TaxComputation.create({
    tenantId,
    employeeId,
    financialYear,
    regime: regimeSelection?.regime || 'New',
    monthlyComputations: [],
    status: 'Draft',
  });
}

/**
 * Helper: Get current financial year
 */
function getCurrentFinancialYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  if (month >= 3) { // April onwards
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}
