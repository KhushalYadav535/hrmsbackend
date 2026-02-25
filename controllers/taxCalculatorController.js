const TaxRegimeSelection = require('../models/TaxRegimeSelection');
const TaxDeclaration = require('../models/TaxDeclaration');
const HRADeclaration = require('../models/HRADeclaration');
const Employee = require('../models/Employee');
const Payroll = require('../models/Payroll');
const { compareTaxRegimes, calculateHRAExemption } = require('../services/taxCalculationService');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { createAuditLog } = require('../utils/auditLog');

/**
 * Compare tax regimes
 * BRD: BR-TAX-001, BR-TAX-008
 */
exports.compareRegimes = asyncHandler(async (req, res) => {
  const { financialYear, annualSalary, basicSalary, hra, otherAllowances, declarations, rentDetails } = req.body;
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

  // Get actual data if not provided
  let grossSalary = annualSalary;
  let basic = basicSalary;
  let hraAmount = hra;
  let otherAllow = otherAllowances;

  if (!grossSalary) {
    // Get from latest payroll
    const latestPayroll = await Payroll.findOne({
      tenantId: req.tenantId,
      employeeId: employee._id,
    }).sort({ createdAt: -1 });

    if (latestPayroll) {
      grossSalary = (latestPayroll.grossSalary || 0) * 12;
      basic = (latestPayroll.basicSalary || 0) * 12;
      hraAmount = (latestPayroll.hra || 0) * 12;
      otherAllow = grossSalary - basic - hraAmount;
    }
  }

  // Get HRA declaration if exists
  const hraDecl = await HRADeclaration.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  // Calculate HRA exemption
  let hraExemption = 0;
  if (rentDetails || hraDecl) {
    const rent = rentDetails?.monthlyRent || hraDecl?.rentDetails?.monthlyRent || 0;
    const isMetro = rentDetails?.isMetro || hraDecl?.isMetro || false;
    hraExemption = calculateHRAExemption(
      hraAmount / 12,
      basic / 12,
      rent,
      isMetro
    ) * 12;
  }

  // Get tax declarations
  const taxDecl = await TaxDeclaration.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  const deductions = {
    section80C: 0,
    section80D: 0,
    section80E: 0,
    section80G: 0,
    section80CCD: 0,
    otherDeductions: 0,
  };

  if (taxDecl) {
    taxDecl.declarations.forEach(dec => {
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

  // Override with provided declarations
  if (declarations) {
    Object.assign(deductions, declarations);
  }

  const exemptions = {
    hraExemption,
    ltaExemption: 0,
    otherExemptions: 0,
  };

  const comparison = compareTaxRegimes(grossSalary, exemptions, deductions);

  res.status(200).json({
    success: true,
    data: comparison,
  });
});

/**
 * Select tax regime
 * BRD: BR-TAX-001, BR-TAX-004
 */
exports.selectRegime = asyncHandler(async (req, res) => {
  const { regime, financialYear } = req.body;
  const currentFY = financialYear || getCurrentFinancialYear();
  
  if (!['Old', 'New'].includes(regime)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid regime. Must be Old or New',
    });
  }

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

  // Check if regime already selected
  let regimeSelection = await TaxRegimeSelection.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  if (regimeSelection) {
    // Check if change is allowed (once per FY)
    if (regimeSelection.regime !== regime && regimeSelection.changeCount >= 1) {
      return res.status(400).json({
        success: false,
        message: 'Tax regime can only be changed once per financial year',
      });
    }

    regimeSelection.regime = regime;
    if (regimeSelection.regime !== regime) {
      regimeSelection.changedDate = Date.now();
      regimeSelection.changeCount += 1;
    }
  } else {
    regimeSelection = await TaxRegimeSelection.create({
      tenantId: req.tenantId,
      employeeId: employee._id,
      financialYear: currentFY,
      regime,
    });
  }

  await regimeSelection.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Create',
    entityType: 'TaxRegimeSelection',
    entityId: regimeSelection._id,
    description: `Tax regime selected: ${regime} for FY ${currentFY}`,
  });

  res.status(200).json({
    success: true,
    data: regimeSelection,
  });
});

/**
 * Get recommended regime
 * BRD: BR-TAX-003
 */
exports.getRecommendedRegime = asyncHandler(async (req, res) => {
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

  // Get comparison data
  let grossSalary = 0;
  let basic = 0;
  let hraAmount = 0;
  let otherAllow = 0;

  // Get from latest payroll
  const latestPayroll = await Payroll.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
  }).sort({ createdAt: -1 });

  if (latestPayroll) {
    grossSalary = (latestPayroll.grossSalary || 0) * 12;
    basic = (latestPayroll.basicSalary || 0) * 12;
    hraAmount = (latestPayroll.hra || 0) * 12;
    otherAllow = grossSalary - basic - hraAmount;
  }

  // Get HRA declaration
  const hraDecl = await HRADeclaration.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  // Calculate HRA exemption
  let hraExemption = 0;
  if (hraDecl) {
    const rent = hraDecl.rentDetails?.monthlyRent || 0;
    const isMetro = hraDecl.isMetro || false;
    hraExemption = calculateHRAExemption(
      hraAmount / 12,
      basic / 12,
      rent,
      isMetro
    ) * 12;
  }

  // Get tax declarations
  const taxDecl = await TaxDeclaration.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  const deductions = {
    section80C: 0,
    section80D: 0,
    section80E: 0,
    section80G: 0,
    section80CCD: 0,
    otherDeductions: 0,
  };

  if (taxDecl) {
    taxDecl.declarations.forEach(dec => {
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

  const exemptions = {
    hraExemption,
    ltaExemption: 0,
    otherExemptions: 0,
  };

  const comparison = compareTaxRegimes(grossSalary, exemptions, deductions);

  // Update regime selection with recommendation
  let regimeSelection = await TaxRegimeSelection.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  if (regimeSelection) {
    regimeSelection.recommendedRegime = comparison.recommendedRegime;
    regimeSelection.oldRegimeTax = comparison.oldRegime.totalTax;
    regimeSelection.newRegimeTax = comparison.newRegime.totalTax;
    regimeSelection.taxSavings = comparison.taxSavings;
    regimeSelection.recommendationReason = comparison.recommendationReason;
    await regimeSelection.save();
  }

  res.status(200).json({
    success: true,
    data: {
      recommendedRegime: comparison.recommendedRegime,
      taxSavings: comparison.taxSavings,
      recommendationReason: comparison.recommendationReason,
      comparison,
    },
  });
});

/**
 * Calculate HRA exemption
 * BRD: BR-TAX-003
 */
exports.calculateHRA = asyncHandler(async (req, res) => {
  const { monthlyRent, basicSalary, hraReceived, isMetro } = req.body;
  
  if (!monthlyRent || !basicSalary || !hraReceived) {
    return res.status(400).json({
      success: false,
      message: 'monthlyRent, basicSalary, and hraReceived are required',
    });
  }

  const exemption = calculateHRAExemption(
    hraReceived,
    basicSalary,
    monthlyRent,
    isMetro || false
  );

  res.status(200).json({
    success: true,
    data: {
      exemption,
      calculation: {
        actualHra: hraReceived,
        percentageOfBasic: (isMetro ? 0.5 : 0.4) * basicSalary,
        rentMinus10PercentBasic: monthlyRent - (basicSalary * 0.1),
      },
    },
  });
});

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
