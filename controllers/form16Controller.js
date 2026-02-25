const Form16 = require('../models/Form16');
const TaxComputation = require('../models/TaxComputation');
const TaxDeclaration = require('../models/TaxDeclaration');
const HRADeclaration = require('../models/HRADeclaration');
const Employee = require('../models/Employee');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { createAuditLog } = require('../utils/auditLog');

/**
 * Generate Form 16
 * BRD: BR-TAX-010
 */
exports.generateForm16 = asyncHandler(async (req, res) => {
  const { financialYear, employeeId } = req.body;
  const currentFY = financialYear || getCurrentFinancialYear();
  
  const targetEmployeeId = employeeId || (await getEmployeeIdFromUser(req));
  
  if (!targetEmployeeId) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found',
    });
  }

  // Check if Form 16 already exists
  let form16 = await Form16.findOne({
    tenantId: req.tenantId,
    employeeId: targetEmployeeId,
    financialYear: currentFY,
  });

  // Get tax computation
  const computation = await TaxComputation.findOne({
    tenantId: req.tenantId,
    employeeId: targetEmployeeId,
    financialYear: currentFY,
  });

  if (!computation) {
    return res.status(404).json({
      success: false,
      message: 'Tax computation not found. Please calculate tax first.',
    });
  }

  // Get employee details
  const employee = await Employee.findById(targetEmployeeId);

  // Get tax declaration
  const taxDecl = await TaxDeclaration.findOne({
    tenantId: req.tenantId,
    employeeId: targetEmployeeId,
    financialYear: currentFY,
  });

  // Get HRA declaration
  const hraDecl = await HRADeclaration.findOne({
    tenantId: req.tenantId,
    employeeId: targetEmployeeId,
    financialYear: currentFY,
  });

  // Calculate annual totals
  const annualGross = computation.annualGrossSalary || 0;
  const annualTds = computation.annualTdsDeducted || 0;
  
  // Calculate deductions
  let section80C = 0, section80D = 0, section80E = 0, section80G = 0, section80CCD = 0, otherDeductions = 0;
  
  if (taxDecl) {
    taxDecl.declarations.forEach(dec => {
      if (dec.status === 'Approved') {
        switch (dec.section) {
          case '80C':
            section80C += dec.amount;
            break;
          case '80D':
            section80D += dec.amount;
            break;
          case '80E':
            section80E += dec.amount;
            break;
          case '80G':
            section80G += dec.amount;
            break;
          case '80CCD':
            section80CCD += dec.amount;
            break;
          default:
            otherDeductions += dec.amount;
        }
      }
    });
  }

  const totalDeductions = section80C + section80D + section80E + section80G + section80CCD + otherDeductions;
  const hraExemption = hraDecl?.calculatedExemption?.exemptionAmount || 0;
  const standardDeduction = 50000;
  const taxableIncome = computation.annualTaxableIncome || 0;
  const totalTax = computation.annualTotalTax || 0;
  const cess = computation.annualCess || 0;

  // Prepare Part B
  const partB = {
    grossSalary: annualGross,
    allowances: annualGross * 0.3, // Estimate
    perquisites: 0,
    profitsInLieOfSalary: 0,
    totalSalary: annualGross,
    hraExemption,
    ltaExemption: 0,
    otherExemptions: 0,
    totalExemptions: hraExemption,
    standardDeduction,
    section80C,
    section80D,
    section80E,
    section80G,
    section80CCD,
    otherDeductions,
    totalDeductions,
    taxableIncome,
    taxOnTaxableIncome: totalTax - cess,
    rebate87A: 0, // TODO: Calculate
    surcharge: 0,
    cess,
    totalTax,
    tdsDeducted: annualTds,
    taxRefund: computation.taxRefund || 0,
    taxPayable: computation.taxPayable || 0,
    monthWiseTds: computation.monthlyComputations.map(m => ({
      month: m.month,
      tdsAmount: m.tdsDeducted || 0,
    })),
  };

  if (form16) {
    form16.partB = partB;
    form16.status = 'Generated';
    form16.generatedDate = Date.now();
    form16.generatedBy = req.user._id;
  } else {
    form16 = await Form16.create({
      tenantId: req.tenantId,
      employeeId: targetEmployeeId,
      financialYear: currentFY,
      partA: {
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeePan: employee.pan || '',
        assessmentYear: getAssessmentYear(currentFY),
      },
      partB,
      status: 'Generated',
      generatedDate: Date.now(),
      generatedBy: req.user._id,
    });
  }

  await form16.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Create',
    entityType: 'Form16',
    entityId: form16._id,
    description: `Form 16 generated for FY ${currentFY}`,
  });

  res.status(200).json({
    success: true,
    data: form16,
    message: 'Form 16 generated successfully',
  });
});

/**
 * Get Form 16
 */
exports.getForm16 = asyncHandler(async (req, res) => {
  const { financialYear, employeeId } = req.query;
  const currentFY = financialYear || getCurrentFinancialYear();
  
  const targetEmployeeId = employeeId || (await getEmployeeIdFromUser(req));
  
  if (!targetEmployeeId) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found',
    });
  }

  const form16 = await Form16.findOne({
    tenantId: req.tenantId,
    employeeId: targetEmployeeId,
    financialYear: currentFY,
  }).populate('employeeId', 'firstName lastName employeeCode pan');

  if (!form16) {
    return res.status(404).json({
      success: false,
      message: 'Form 16 not found',
    });
  }

  res.status(200).json({
    success: true,
    data: form16,
  });
});

/**
 * Helper functions
 */
async function getEmployeeIdFromUser(req) {
  const Employee = require('../models/Employee');
  const employee = await Employee.findOne({ 
    email: req.user.email,
    tenantId: req.tenantId 
  });
  return employee?._id;
}

function getCurrentFinancialYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  if (month >= 3) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

function getAssessmentYear(financialYear) {
  const parts = financialYear.split('-');
  return `${parts[1]}-${parts[1].substring(2)}`;
}
