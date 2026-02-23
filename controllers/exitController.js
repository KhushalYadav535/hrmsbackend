const EmployeeSeparation = require('../models/EmployeeSeparation');
const SeparationClearance = require('../models/SeparationClearance');
const FnfSettlement = require('../models/FnfSettlement');
const Employee = require('../models/Employee');
const EmployeeLoan = require('../models/EmployeeLoan');
const { calculateFullAndFinal, calculateServiceYears } = require('../utils/fnfCalculator');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * @desc    Submit resignation
 * @route   POST /api/exit/resign
 * @access  Private (Employee)
 */
exports.submitResignation = asyncHandler(async (req, res) => {
  const { separationType, resignationDate, lastWorkingDate, noticePeriodDays, resignationReason, resignationLetterUrl } = req.body;

  // Validation
  if (!separationType || !lastWorkingDate) {
    return res.status(400).json({
      success: false,
      message: 'Separation type and last working date are required',
    });
  }

  // Get employee
  const employee = await Employee.findOne({
    _id: req.user.employeeId,
    tenantId: req.tenantId,
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  // Check if employee already has a pending separation
  const existingSeparation = await EmployeeSeparation.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    status: { $in: ['SUBMITTED', 'ACCEPTED', 'NOTICE_PERIOD', 'CLEARANCE_PENDING', 'CLEARANCE_DONE', 'FNF_PENDING'] },
  });

  if (existingSeparation) {
    return res.status(400).json({
      success: false,
      message: 'You already have a pending separation request',
    });
  }

  // Calculate notice period if not provided
  let noticePeriod = noticePeriodDays;
  if (!noticePeriod) {
    // Default notice period based on designation/grade (can be enhanced)
    // For now, use 30 days as default
    noticePeriod = 30;
  }

  // Create separation record
  const separation = await EmployeeSeparation.create({
    tenantId: req.tenantId,
    employeeId: employee._id,
    separationType,
    resignationDate: resignationDate || new Date(),
    lastWorkingDate: new Date(lastWorkingDate),
    noticePeriodDays: noticePeriod,
    noticePeriodServedDays: 0,
    noticePeriodWaived: false,
    resignationReason,
    resignationLetterUrl,
    status: 'SUBMITTED',
    submittedBy: req.user._id,
  });

  // TODO: Send notification to manager/HR

  res.status(201).json({
    success: true,
    message: 'Resignation submitted successfully',
    data: separation,
  });
});

/**
 * @desc    Get separation details
 * @route   GET /api/exit/:id
 * @access  Private
 */
exports.getSeparation = asyncHandler(async (req, res) => {
  const separation = await EmployeeSeparation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('employeeId', 'firstName lastName employeeCode email designation department')
    .populate('submittedBy', 'name email')
    .populate('acceptedBy', 'name email');

  if (!separation) {
    return res.status(404).json({
      success: false,
      message: 'Separation record not found',
    });
  }

  // Check access: Employee can only see their own, HR/Admin can see all
  if (req.user.role !== 'HR Administrator' && req.user.role !== 'Tenant Admin' && req.user.role !== 'Super Admin') {
    if (separation.employeeId._id.toString() !== req.user.employeeId?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }
  }

  res.status(200).json({
    success: true,
    data: separation,
  });
});

/**
 * @desc    Get my separation (for employee)
 * @route   GET /api/exit/my-separation
 * @access  Private (Employee)
 */
exports.getMySeparation = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({
    _id: req.user.employeeId,
    tenantId: req.tenantId,
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  const separation = await EmployeeSeparation.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
  })
    .populate('employeeId', 'firstName lastName employeeCode email designation department')
    .populate('submittedBy', 'name email')
    .populate('acceptedBy', 'name email')
    .sort({ createdAt: -1 });

  if (!separation) {
    return res.status(200).json({
      success: true,
      data: null,
      message: 'No separation record found',
    });
  }

  res.status(200).json({
    success: true,
    data: separation,
  });
});

/**
 * @desc    Accept resignation (Manager/HR)
 * @route   PATCH /api/exit/:id/accept
 * @access  Private (Manager, HR Administrator, Tenant Admin)
 */
exports.acceptResignation = asyncHandler(async (req, res) => {
  const { acceptedDate, hrRemarks } = req.body;

  const separation = await EmployeeSeparation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!separation) {
    return res.status(404).json({
      success: false,
      message: 'Separation record not found',
    });
  }

  if (separation.status !== 'SUBMITTED') {
    return res.status(400).json({
      success: false,
      message: `Cannot accept separation with status: ${separation.status}`,
    });
  }

  separation.status = 'ACCEPTED';
  separation.acceptedBy = req.user._id;
  separation.acceptedDate = acceptedDate ? new Date(acceptedDate) : new Date();
  if (hrRemarks) separation.hrRemarks = hrRemarks;

  // Check if last working date is in future
  const lwd = new Date(separation.lastWorkingDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lwd.setHours(0, 0, 0, 0);

  if (lwd > today) {
    separation.status = 'NOTICE_PERIOD';
  } else {
    separation.status = 'CLEARANCE_PENDING';
  }

  await separation.save();

  // Initialize clearance records for all departments
  const departments = ['IT', 'FINANCE', 'HR', 'ADMIN', 'LIBRARY', 'SECURITY', 'ACCOUNTS'];
  for (const dept of departments) {
    await SeparationClearance.findOneAndUpdate(
      {
        tenantId: req.tenantId,
        separationId: separation._id,
        department: dept,
      },
      {
        tenantId: req.tenantId,
        separationId: separation._id,
        department: dept,
        status: 'PENDING',
      },
      { upsert: true, new: true }
    );
  }

  res.status(200).json({
    success: true,
    message: 'Resignation accepted successfully',
    data: separation,
  });
});

/**
 * @desc    Get clearance checklist
 * @route   GET /api/exit/:id/clearances
 * @access  Private
 */
exports.getClearances = asyncHandler(async (req, res) => {
  const separation = await EmployeeSeparation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!separation) {
    return res.status(404).json({
      success: false,
      message: 'Separation record not found',
    });
  }

  // Check access
  if (req.user.role !== 'HR Administrator' && req.user.role !== 'Tenant Admin' && req.user.role !== 'Super Admin') {
    if (separation.employeeId.toString() !== req.user.employeeId?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }
  }

  const clearances = await SeparationClearance.find({
    tenantId: req.tenantId,
    separationId: separation._id,
  })
    .populate('clearanceOfficerId', 'name email')
    .sort({ department: 1 });

  // Check if all clearances are done
  const allCleared = clearances.every(c => c.status === 'CLEARED' || c.status === 'WAIVED');
  if (allCleared && clearances.length > 0 && separation.status === 'CLEARANCE_PENDING') {
    separation.status = 'CLEARANCE_DONE';
    separation.status = 'FNF_PENDING';
    await separation.save();
  }

  res.status(200).json({
    success: true,
    data: clearances,
    allCleared,
  });
});

/**
 * @desc    Mark department clearance
 * @route   PATCH /api/exit/:id/clearance/:dept
 * @access  Private (Department heads, HR, Admin)
 */
exports.markClearance = asyncHandler(async (req, res) => {
  const { status, remarks, checklistItems } = req.body;
  const { id: separationId, dept: department } = req.params;

  if (!status || !['CLEARED', 'WAIVED'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Status must be CLEARED or WAIVED',
    });
  }

  const separation = await EmployeeSeparation.findOne({
    _id: separationId,
    tenantId: req.tenantId,
  });

  if (!separation) {
    return res.status(404).json({
      success: false,
      message: 'Separation record not found',
    });
  }

  const clearance = await SeparationClearance.findOneAndUpdate(
    {
      tenantId: req.tenantId,
      separationId: separation._id,
      department: department.toUpperCase(),
    },
    {
      status,
      remarks,
      clearanceOfficerId: req.user._id,
      clearanceOfficerName: req.user.name,
      clearedDate: status === 'CLEARED' ? new Date() : null,
      checklistItems: checklistItems || [],
    },
    { upsert: true, new: true }
  );

  // Check if all clearances are done
  const allClearances = await SeparationClearance.find({
    tenantId: req.tenantId,
    separationId: separation._id,
  });

  const allCleared = allClearances.every(c => c.status === 'CLEARED' || c.status === 'WAIVED');
  if (allCleared && allClearances.length > 0 && separation.status === 'CLEARANCE_PENDING') {
    separation.status = 'CLEARANCE_DONE';
    separation.status = 'FNF_PENDING';
    await separation.save();
  }

  res.status(200).json({
    success: true,
    message: `Department clearance ${status.toLowerCase()} successfully`,
    data: clearance,
  });
});

/**
 * @desc    Calculate F&F preview
 * @route   GET /api/exit/:id/fnf
 * @access  Private
 */
exports.calculateFnf = asyncHandler(async (req, res) => {
  const separation = await EmployeeSeparation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('employeeId');

  if (!separation) {
    return res.status(404).json({
      success: false,
      message: 'Separation record not found',
    });
  }

  const employee = separation.employeeId;

  // Get employee salary structure (assuming it's stored in employee or needs to be fetched)
  // For now, using placeholder values - should be fetched from salary structure
  const basicSalary = employee.basicSalary || 50000;
  const daAmount = employee.daAmount || 10000;
  const grossSalary = employee.grossSalary || 90000;

  // Get leave balances from LeaveBalance model
  const LeaveBalance = require('../models/LeaveBalance');
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const financialYear = currentDate.getMonth() >= 3 ? currentYear : currentYear - 1;
  
  const leaveBalances = await LeaveBalance.find({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: financialYear,
  });

  const plBalance = leaveBalances.find(lb => lb.leaveType === 'PL')?.currentBalance || 0;
  const clBalance = leaveBalances.find(lb => lb.leaveType === 'CL')?.currentBalance || 0;

  // Get outstanding loans
  const activeLoans = await EmployeeLoan.find({
    tenantId: req.tenantId,
    employeeId: employee._id,
    status: { $in: ['ACTIVE', 'DISBURSED'] },
  });

  const loanOutstanding = activeLoans.reduce((sum, loan) => sum + (loan.outstandingAmount || 0), 0);

  // Calculate F&F
  const fnfData = calculateFullAndFinal(
    {
      basicSalary,
      daAmount,
      grossSalary,
      joiningDate: employee.joinDate || employee.dateOfJoining || employee.joiningDate,
      plBalance,
      clBalance,
    },
    {
      lastWorkingDate: separation.lastWorkingDate,
      resignationDate: separation.resignationDate,
      noticePeriodDays: separation.noticePeriodDays,
      noticePeriodServedDays: separation.noticePeriodServedDays,
      noticePeriodWaived: separation.noticePeriodWaived,
      lastSalaryMonth: separation.lastWorkingDate.getMonth() + 1,
      lastSalaryYear: separation.lastWorkingDate.getFullYear(),
    },
    {
      loanOutstanding,
      advanceOutstanding: 0, // TODO: Fetch from advance model
      bonusAmount: 0, // TODO: Fetch pending bonus
      pfContribution: 0, // TODO: Calculate PF contribution refund
    }
  );

  res.status(200).json({
    success: true,
    data: fnfData,
  });
});

/**
 * @desc    Create/Update F&F settlement
 * @route   POST /api/exit/:id/fnf
 * @access  Private (HR, Finance, Admin)
 */
exports.createFnfSettlement = asyncHandler(async (req, res) => {
  const separation = await EmployeeSeparation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('employeeId');

  if (!separation) {
    return res.status(404).json({
      success: false,
      message: 'Separation record not found',
    });
  }

  // Check if F&F already exists
  let fnfSettlement = await FnfSettlement.findOne({
    tenantId: req.tenantId,
    separationId: separation._id,
  });

  if (fnfSettlement && fnfSettlement.status !== 'DRAFT') {
    return res.status(400).json({
      success: false,
      message: 'F&F settlement already created and cannot be modified',
    });
  }

  const employee = separation.employeeId;

  // Get employee salary structure
  const basicSalary = employee.basicSalary || 50000;
  const daAmount = employee.daAmount || 10000;
  const grossSalary = employee.grossSalary || 90000;

  // Get leave balances from LeaveBalance model
  const LeaveBalance = require('../models/LeaveBalance');
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const financialYear = currentDate.getMonth() >= 3 ? currentYear : currentYear - 1;
  
  const leaveBalances = await LeaveBalance.find({
    tenantId: req.tenantId,
    employeeId: employee._id,
    financialYear: financialYear,
  });

  const plBalance = leaveBalances.find(lb => lb.leaveType === 'PL')?.currentBalance || 0;
  const clBalance = leaveBalances.find(lb => lb.leaveType === 'CL')?.currentBalance || 0;

  // Get outstanding loans
  const activeLoans = await EmployeeLoan.find({
    tenantId: req.tenantId,
    employeeId: employee._id,
    status: { $in: ['ACTIVE', 'DISBURSED'] },
  });

  const loanOutstanding = activeLoans.reduce((sum, loan) => sum + (loan.outstandingAmount || 0), 0);

  // Calculate F&F
  const fnfData = calculateFullAndFinal(
    {
      basicSalary,
      daAmount,
      grossSalary,
      joiningDate: employee.joinDate || employee.dateOfJoining || employee.joiningDate,
      plBalance,
      clBalance,
    },
    {
      lastWorkingDate: separation.lastWorkingDate,
      resignationDate: separation.resignationDate,
      noticePeriodDays: separation.noticePeriodDays,
      noticePeriodServedDays: separation.noticePeriodServedDays,
      noticePeriodWaived: separation.noticePeriodWaived,
      lastSalaryMonth: separation.lastWorkingDate.getMonth() + 1,
      lastSalaryYear: separation.lastWorkingDate.getFullYear(),
    },
    {
      loanOutstanding,
      advanceOutstanding: 0,
      bonusAmount: 0,
      pfContribution: 0,
    }
  );

  const serviceInfo = calculateServiceYears(
    employee.joiningDate || employee.dateOfJoining,
    separation.lastWorkingDate
  );

  // Create or update F&F settlement
  const settlementData = {
    tenantId: req.tenantId,
    separationId: separation._id,
    employeeId: employee._id,
    ...fnfData,
    status: 'DRAFT',
    calculationMetadata: {
      lastSalaryMonth: separation.lastWorkingDate.getMonth() + 1,
      lastSalaryYear: separation.lastWorkingDate.getFullYear(),
      serviceYears: serviceInfo.serviceYears,
      serviceDays: serviceInfo.serviceDays,
      basicSalary,
      daAmount,
      grossSalary,
      calculatedAt: new Date(),
      calculatedBy: req.user._id,
    },
  };

  if (fnfSettlement) {
    Object.assign(fnfSettlement, settlementData);
    await fnfSettlement.save();
  } else {
    fnfSettlement = await FnfSettlement.create(settlementData);
  }

  res.status(200).json({
    success: true,
    message: 'F&F settlement calculated successfully',
    data: fnfSettlement,
  });
});

/**
 * @desc    Approve F&F settlement
 * @route   POST /api/exit/:id/fnf/approve
 * @access  Private (HR Head, Finance Head, Admin)
 */
exports.approveFnfSettlement = asyncHandler(async (req, res) => {
  const { remarks } = req.body;

  const separation = await EmployeeSeparation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!separation) {
    return res.status(404).json({
      success: false,
      message: 'Separation record not found',
    });
  }

  const fnfSettlement = await FnfSettlement.findOne({
    tenantId: req.tenantId,
    separationId: separation._id,
  });

  if (!fnfSettlement) {
    return res.status(404).json({
      success: false,
      message: 'F&F settlement not found. Please create it first.',
    });
  }

  if (fnfSettlement.status === 'PAID') {
    return res.status(400).json({
      success: false,
      message: 'F&F settlement already paid',
    });
  }

  fnfSettlement.status = 'APPROVED';
  fnfSettlement.approvedBy = req.user._id;
  fnfSettlement.approvedDate = new Date();
  if (remarks) fnfSettlement.remarks = remarks;

  await fnfSettlement.save();

  // Update separation status
  separation.status = 'FNF_APPROVED';
  await separation.save();

  res.status(200).json({
    success: true,
    message: 'F&F settlement approved successfully',
    data: fnfSettlement,
  });
});

/**
 * @desc    Mark F&F as paid
 * @route   PATCH /api/exit/:id/fnf/pay
 * @access  Private (Finance, Admin)
 */
exports.markFnfPaid = asyncHandler(async (req, res) => {
  const { paidDate, paymentMode, paymentReference } = req.body;

  const separation = await EmployeeSeparation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!separation) {
    return res.status(404).json({
      success: false,
      message: 'Separation record not found',
    });
  }

  const fnfSettlement = await FnfSettlement.findOne({
    tenantId: req.tenantId,
    separationId: separation._id,
  });

  if (!fnfSettlement) {
    return res.status(404).json({
      success: false,
      message: 'F&F settlement not found',
    });
  }

  if (fnfSettlement.status !== 'APPROVED') {
    return res.status(400).json({
      success: false,
      message: 'F&F settlement must be approved before marking as paid',
    });
  }

  fnfSettlement.status = 'PAID';
  fnfSettlement.paidDate = paidDate ? new Date(paidDate) : new Date();
  fnfSettlement.paymentMode = paymentMode || 'NEFT';
  fnfSettlement.paymentReference = paymentReference;

  await fnfSettlement.save();

  // Update separation status to completed
  separation.status = 'COMPLETED';
  separation.completedDate = new Date();
  await separation.save();

  // TODO: Update employee status to "Separated" or "Inactive"
  await Employee.findByIdAndUpdate(separation.employeeId, {
    status: 'Separated',
  });

  res.status(200).json({
    success: true,
    message: 'F&F settlement marked as paid',
    data: fnfSettlement,
  });
});

/**
 * @desc    Get all pending exits (Admin dashboard)
 * @route   GET /api/exit/admin
 * @access  Private (HR Administrator, Tenant Admin, Super Admin)
 */
exports.getAllExits = asyncHandler(async (req, res) => {
  const { status, separationType, startDate, endDate } = req.query;

  const filter = { tenantId: req.tenantId };

  if (status) filter.status = status;
  if (separationType) filter.separationType = separationType;

  if (startDate || endDate) {
    filter.lastWorkingDate = {};
    if (startDate) filter.lastWorkingDate.$gte = new Date(startDate);
    if (endDate) filter.lastWorkingDate.$lte = new Date(endDate);
  }

  const separations = await EmployeeSeparation.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode email designation department')
    .populate('submittedBy', 'name email')
    .populate('acceptedBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(100);

  // Get summary counts
  const summary = {
    total: await EmployeeSeparation.countDocuments({ tenantId: req.tenantId }),
    submitted: await EmployeeSeparation.countDocuments({ tenantId: req.tenantId, status: 'SUBMITTED' }),
    noticePeriod: await EmployeeSeparation.countDocuments({ tenantId: req.tenantId, status: 'NOTICE_PERIOD' }),
    clearancePending: await EmployeeSeparation.countDocuments({ tenantId: req.tenantId, status: 'CLEARANCE_PENDING' }),
    fnfPending: await EmployeeSeparation.countDocuments({ tenantId: req.tenantId, status: 'FNF_PENDING' }),
    completed: await EmployeeSeparation.countDocuments({ tenantId: req.tenantId, status: 'COMPLETED' }),
  };

  res.status(200).json({
    success: true,
    count: separations.length,
    summary,
    data: separations,
  });
});
