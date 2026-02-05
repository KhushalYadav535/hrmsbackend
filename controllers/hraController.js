const HRADeclaration = require('../models/HRADeclaration');
const Employee = require('../models/Employee');
const Payroll = require('../models/Payroll');
const { calculateHRAExemption } = require('../services/taxCalculationService');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { createAuditLog } = require('../utils/auditLog');

/**
 * Create/Update HRA Declaration
 * BRD: BR-TAX-003
 */
exports.createHRADeclaration = asyncHandler(async (req, res) => {
  const { financialYear, rentDetails } = req.body;
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

  // Get latest payroll for HRA and basic salary
  const latestPayroll = await Payroll.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
  }).sort({ createdAt: -1 });

  if (!latestPayroll) {
    return res.status(404).json({
      success: false,
      message: 'Payroll data not found',
    });
  }

  const monthlyHRA = latestPayroll.hra || 0;
  const monthlyBasic = latestPayroll.basicSalary || 0;
  const monthlyRent = rentDetails.monthlyRent || 0;
  const isMetro = rentDetails.isMetro || false;

  // Validate landlord PAN if annual rent > ₹1 lakh
  if (monthlyRent * 12 > 100000 && !rentDetails.landlordPan) {
    return res.status(400).json({
      success: false,
      message: 'Landlord PAN is required if annual rent exceeds ₹1,00,000',
    });
  }

  // Calculate exemption
  const exemption = calculateHRAExemption(
    monthlyHRA,
    monthlyBasic,
    monthlyRent,
    isMetro
  );

  // Check if declaration exists
  let hraDeclaration = await HRADeclaration.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  if (hraDeclaration) {
    hraDeclaration.rentDetails = rentDetails;
    hraDeclaration.hraReceived = monthlyHRA;
    hraDeclaration.basicSalary = monthlyBasic;
    hraDeclaration.isMetro = isMetro;
    hraDeclaration.calculatedExemption = {
      actualHra: monthlyHRA,
      percentageOfBasic: isMetro ? monthlyBasic * 0.5 : monthlyBasic * 0.4,
      rentMinus10PercentBasic: monthlyRent - (monthlyBasic * 0.1),
      exemptionAmount: exemption,
    };
    hraDeclaration.status = 'Submitted';
    hraDeclaration.submittedDate = Date.now();
  } else {
    hraDeclaration = await HRADeclaration.create({
      tenantId: req.tenantId,
      employeeId: employee._id,
      financialYear: currentFY,
      rentDetails,
      hraReceived: monthlyHRA,
      basicSalary: monthlyBasic,
      isMetro,
      calculatedExemption: {
        actualHra: monthlyHRA,
        percentageOfBasic: isMetro ? monthlyBasic * 0.5 : monthlyBasic * 0.4,
        rentMinus10PercentBasic: monthlyRent - (monthlyBasic * 0.1),
        exemptionAmount: exemption,
      },
      status: 'Submitted',
      submittedDate: Date.now(),
    });
  }

  await hraDeclaration.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    entityType: 'HRADeclaration',
    entityId: hraDeclaration._id,
    description: `HRA declaration submitted for FY ${currentFY}`,
  });

  res.status(200).json({
    success: true,
    data: hraDeclaration,
    message: 'HRA declaration submitted successfully',
  });
});

/**
 * Get HRA Declaration
 */
exports.getHRADeclaration = asyncHandler(async (req, res) => {
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

  const hraDeclaration = await HRADeclaration.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: currentFY,
  });

  res.status(200).json({
    success: true,
    data: hraDeclaration,
  });
});

/**
 * Verify HRA Declaration (HR Admin)
 */
exports.verifyHRADeclaration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;

  if (!['Verified', 'Rejected'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Status must be Verified or Rejected',
    });
  }

  const hraDeclaration = await HRADeclaration.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!hraDeclaration) {
    return res.status(404).json({
      success: false,
      message: 'HRA declaration not found',
    });
  }

  hraDeclaration.status = status;
  hraDeclaration.verifiedBy = req.user._id;
  hraDeclaration.verifiedDate = Date.now();
  
  if (status === 'Rejected' && rejectionReason) {
    hraDeclaration.rejectionReason = rejectionReason;
  }

  await hraDeclaration.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'HRADeclaration',
    entityId: hraDeclaration._id,
    description: `HRA declaration ${status.toLowerCase()}`,
  });

  res.status(200).json({
    success: true,
    data: hraDeclaration,
  });
});

/**
 * Helper: Get current financial year
 */
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
