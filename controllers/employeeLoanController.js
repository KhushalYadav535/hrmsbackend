const EmployeeLoan = require('../models/EmployeeLoan');
const LoanType = require('../models/LoanType');
const LoanEmiSchedule = require('../models/LoanEmiSchedule');
const LoanApproval = require('../models/LoanApproval');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { calculateEMIWithDates } = require('../utils/emiCalculator');
const { validateLoanApplication, getExistingLoanObligations } = require('../utils/loanEligibility');

/**
 * @desc    Apply for a loan
 * @route   POST /api/loans/apply
 * @access  Private (Employee)
 */
exports.applyForLoan = asyncHandler(async (req, res) => {
  const { loanTypeId, appliedAmount, tenureMonths, remarks } = req.body;

  // Validate required fields
  if (!loanTypeId || !appliedAmount || !tenureMonths) {
    return res.status(400).json({
      success: false,
      message: 'Please provide loanTypeId, appliedAmount, and tenureMonths',
    });
  }

  // Get employee
  const employee = await Employee.findOne({
    email: req.user.email,
    tenantId: req.tenantId,
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found',
    });
  }

  // Get loan type
  const loanType = await LoanType.findOne({
    _id: loanTypeId,
    tenantId: req.tenantId,
    isActive: true,
  });

  if (!loanType) {
    return res.status(404).json({
      success: false,
      message: 'Loan type not found or inactive',
    });
  }

  // Calculate take-home salary (gross - deductions estimate)
  // For now, use 70% of gross as take-home estimate
  const takeHomeSalary = employee.salary * 0.7;

  // Validate loan application
  const validation = await validateLoanApplication(
    employee,
    loanType,
    appliedAmount,
    tenureMonths,
    takeHomeSalary
  );

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: 'Loan application validation failed',
      errors: validation.errors,
      warnings: validation.warnings,
      emiPreview: validation.emiPreview,
    });
  }

  // Create loan application
  const loan = await EmployeeLoan.create({
    tenantId: req.tenantId,
    employeeId: employee._id,
    loanTypeId: loanType._id,
    appliedAmount,
    tenureMonths,
    interestRate: loanType.interestRatePercent,
    emiAmount: validation.emiPreview.emiAmount,
    status: 'APPLIED',
    remarks,
  });

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userRole: req.user.role,
    action: 'Create',
    entityType: 'EmployeeLoan',
    entityId: loan._id,
    description: `Applied for ${loanType.loanName}: ₹${appliedAmount.toLocaleString()}`,
    metadata: {
      loanType: loanType.loanName,
      appliedAmount,
      tenureMonths,
    },
  });

  // Populate loan type for response
  await loan.populate('loanTypeId', 'loanName loanCode');

  res.status(201).json({
    success: true,
    message: 'Loan application submitted successfully',
    data: loan,
    emiPreview: validation.emiPreview,
    warnings: validation.warnings,
  });
});

/**
 * @desc    Get employee's loans
 * @route   GET /api/loans/my-loans
 * @access  Private (Employee)
 */
exports.getMyLoans = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({
    email: req.user.email,
    tenantId: req.tenantId,
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found',
    });
  }

  const loans = await EmployeeLoan.find({
    tenantId: req.tenantId,
    employeeId: employee._id,
  })
    .populate('loanTypeId', 'loanName loanCode')
    .sort({ createdAt: -1 });

  // Get existing loan obligations summary
  const obligations = await getExistingLoanObligations(employee._id, req.tenantId);

  res.status(200).json({
    success: true,
    count: loans.length,
    data: loans,
    obligations: {
      totalEMI: obligations.totalEMI,
      activeLoans: obligations.activeLoans,
    },
  });
});

/**
 * @desc    Get loan approval queue (for managers/HR/Finance)
 * @route   GET /api/loans/approve-queue
 * @access  Private (Manager, HR Administrator, Finance Administrator)
 */
exports.getApprovalQueue = asyncHandler(async (req, res) => {
  const userRole = req.user.role;
  let statusFilter = [];
  let approvalLevel = null;

  // Determine which statuses this role can approve
  if (userRole === 'Manager') {
    statusFilter = ['APPLIED'];
    approvalLevel = 1;
  } else if (userRole === 'HR Administrator') {
    statusFilter = ['MANAGER_APPROVED'];
    approvalLevel = 2;
  } else if (userRole === 'Finance Administrator' || userRole === 'Tenant Admin' || userRole === 'Super Admin') {
    statusFilter = ['HR_VERIFIED'];
    approvalLevel = 3;
  } else {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to approve loans',
    });
  }

  const loans = await EmployeeLoan.find({
    tenantId: req.tenantId,
    status: { $in: statusFilter },
  })
    .populate('employeeId', 'firstName lastName employeeCode email designation')
    .populate('loanTypeId', 'loanName loanCode maxAmount')
    .sort({ createdAt: 1 }); // Oldest first

  res.status(200).json({
    success: true,
    count: loans.length,
    data: loans,
    approvalLevel,
  });
});

/**
 * @desc    Approve or reject loan
 * @route   PATCH /api/loans/:id/approve
 * @access  Private (Manager, HR Administrator, Finance Administrator)
 */
exports.approveLoan = asyncHandler(async (req, res) => {
  const { action, remarks, sanctionedAmount } = req.body; // action: 'APPROVED' or 'REJECTED'

  if (!action || !['APPROVED', 'REJECTED'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide action: APPROVED or REJECTED',
    });
  }

  const loan = await EmployeeLoan.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('loanTypeId')
    .populate('employeeId');

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: 'Loan not found',
    });
  }

  const userRole = req.user.role;
  let nextStatus = null;
  let approvalLevel = null;

  // Determine next status based on current status and role
  if (loan.status === 'APPLIED' && userRole === 'Manager') {
    approvalLevel = 1;
    nextStatus = action === 'APPROVED' ? 'MANAGER_APPROVED' : 'REJECTED';
  } else if (loan.status === 'MANAGER_APPROVED' && userRole === 'HR Administrator') {
    approvalLevel = 2;
    nextStatus = action === 'APPROVED' ? 'HR_VERIFIED' : 'REJECTED';
  } else if (loan.status === 'HR_VERIFIED' && (userRole === 'Finance Administrator' || userRole === 'Tenant Admin' || userRole === 'Super Admin')) {
    approvalLevel = 3;
    if (action === 'APPROVED') {
      // Finance can set sanctioned amount (may differ from applied)
      const finalAmount = sanctionedAmount || loan.appliedAmount;
      const finalTenure = loan.tenureMonths;
      
      // Recalculate EMI with sanctioned amount
      const emiCalculation = calculateEMI(finalAmount, loan.interestRate, finalTenure);
      
      loan.sanctionedAmount = finalAmount;
      loan.emiAmount = emiCalculation.emiAmount;
      loan.outstandingAmount = finalAmount; // Will be updated when disbursed
      
      nextStatus = 'FINANCE_SANCTIONED';
    } else {
      nextStatus = 'REJECTED';
    }
  } else {
    return res.status(403).json({
      success: false,
      message: `You cannot ${action.toLowerCase()} loans in ${loan.status} status`,
    });
  }

  // Update loan status
  loan.status = nextStatus;
  loan.remarks = remarks || loan.remarks;
  await loan.save();

  // Create approval record
  await LoanApproval.create({
    tenantId: req.tenantId,
    loanId: loan._id,
    approverId: req.user._id,
    approverName: req.user.name || req.user.email,
    approverRole: userRole,
    approvalLevel,
    action,
    remarks,
    timestamp: new Date(),
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
  });

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userRole: userRole,
    action: action === 'APPROVED' ? 'Approve' : 'Reject',
    entityType: 'EmployeeLoan',
    entityId: loan._id,
    description: `${action} loan application at level ${approvalLevel}`,
    metadata: {
      loanType: loan.loanTypeId?.loanName,
      appliedAmount: loan.appliedAmount,
      sanctionedAmount: loan.sanctionedAmount,
      status: nextStatus,
    },
  });

  // Populate for response
  await loan.populate('loanTypeId', 'loanName loanCode');
  await loan.populate('employeeId', 'firstName lastName employeeCode');

  res.status(200).json({
    success: true,
    message: `Loan ${action.toLowerCase()} successfully`,
    data: loan,
  });
});

/**
 * @desc    Disburse loan (Finance only)
 * @route   PATCH /api/loans/:id/disburse
 * @access  Private (Finance Administrator, Tenant Admin)
 */
exports.disburseLoan = asyncHandler(async (req, res) => {
  const loan = await EmployeeLoan.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    status: 'FINANCE_SANCTIONED',
  })
    .populate('loanTypeId')
    .populate('employeeId');

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: 'Loan not found or not ready for disbursement',
    });
  }

  // Generate EMI schedule
  const disbursalDate = new Date();
  const emiSchedule = calculateEMIWithDates(
    loan.sanctionedAmount,
    loan.interestRate,
    loan.tenureMonths,
    disbursalDate
  );

  // Create EMI schedule records
  const scheduleRecords = emiSchedule.schedule.map(emi => ({
    tenantId: req.tenantId,
    loanId: loan._id,
    emiNumber: emi.emiNumber,
    dueDate: emi.dueDate,
    principalAmount: emi.principalAmount,
    interestAmount: emi.interestAmount,
    emiAmount: emi.emiAmount,
    status: 'PENDING',
  }));

  await LoanEmiSchedule.insertMany(scheduleRecords);

  // Update loan status
  loan.status = 'DISBURSED';
  loan.disbursalDate = disbursalDate;
  loan.outstandingAmount = loan.sanctionedAmount;
  await loan.save();

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userRole: req.user.role,
    action: 'DISBURSE',
    entityType: 'EmployeeLoan',
    entityId: loan._id,
    description: `Disbursed loan: ₹${loan.sanctionedAmount.toLocaleString()}`,
    metadata: {
      loanType: loan.loanTypeId?.loanName,
      sanctionedAmount: loan.sanctionedAmount,
      emiAmount: loan.emiAmount,
      tenureMonths: loan.tenureMonths,
    },
  });

  await loan.populate('loanTypeId', 'loanName loanCode');
  await loan.populate('employeeId', 'firstName lastName employeeCode');

  res.status(200).json({
    success: true,
    message: 'Loan disbursed successfully',
    data: loan,
    emiSchedule: {
      totalEMIs: scheduleRecords.length,
      firstEMIDate: scheduleRecords[0]?.dueDate,
      lastEMIDate: scheduleRecords[scheduleRecords.length - 1]?.dueDate,
    },
  });
});

/**
 * @desc    Get loan EMI schedule
 * @route   GET /api/loans/:id/schedule
 * @access  Private
 */
exports.getLoanSchedule = asyncHandler(async (req, res) => {
  const loan = await EmployeeLoan.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('loanTypeId', 'loanName loanCode')
    .populate('employeeId', 'firstName lastName employeeCode');

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: 'Loan not found',
    });
  }

  // Check access: Employee can only see their own loans
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({
      email: req.user.email,
      tenantId: req.tenantId,
    });
    if (loan.employeeId._id.toString() !== employee._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own loan schedules',
      });
    }
  }

  const schedule = await LoanEmiSchedule.find({
    tenantId: req.tenantId,
    loanId: loan._id,
  })
    .populate('payrollId', 'month year')
    .sort({ emiNumber: 1 });

  // Calculate summary
  const paidEMIs = schedule.filter(e => e.status === 'PAID');
  const pendingEMIs = schedule.filter(e => e.status === 'PENDING');
  const overdueEMIs = schedule.filter(e => e.status === 'OVERDUE');

  const totalPaid = paidEMIs.reduce((sum, e) => sum + e.paidAmount, 0);
  const totalPending = pendingEMIs.reduce((sum, e) => sum + e.emiAmount, 0);

  res.status(200).json({
    success: true,
    data: {
      loan: {
        _id: loan._id,
        loanType: loan.loanTypeId?.loanName,
        sanctionedAmount: loan.sanctionedAmount,
        emiAmount: loan.emiAmount,
        outstandingAmount: loan.outstandingAmount,
        status: loan.status,
        disbursalDate: loan.disbursalDate,
      },
      schedule,
      summary: {
        totalEMIs: schedule.length,
        paidEMIs: paidEMIs.length,
        pendingEMIs: pendingEMIs.length,
        overdueEMIs: overdueEMIs.length,
        totalPaid,
        totalPending,
        nextEMIDate: pendingEMIs[0]?.dueDate,
      },
    },
  });
});

/**
 * @desc    Get all loans (HR Admin dashboard)
 * @route   GET /api/loans/admin
 * @access  Private (HR Administrator, Finance Administrator, Tenant Admin)
 */
exports.getAllLoans = asyncHandler(async (req, res) => {
  const { status, loanTypeId, employeeId, startDate, endDate } = req.query;

  const filter = { tenantId: req.tenantId };

  if (status) filter.status = status;
  if (loanTypeId) filter.loanTypeId = loanTypeId;
  if (employeeId) filter.employeeId = employeeId;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const loans = await EmployeeLoan.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode email designation department')
    .populate('loanTypeId', 'loanName loanCode')
    .sort({ createdAt: -1 })
    .limit(parseInt(req.query.limit) || 100)
    .skip(parseInt(req.query.skip) || 0);

  // Get summary statistics
  const totalLoans = await EmployeeLoan.countDocuments({ tenantId: req.tenantId });
  const activeLoans = await EmployeeLoan.countDocuments({ tenantId: req.tenantId, status: { $in: ['ACTIVE', 'DISBURSED'] } });
  const pendingApprovals = await EmployeeLoan.countDocuments({ tenantId: req.tenantId, status: { $in: ['APPLIED', 'MANAGER_APPROVED', 'HR_VERIFIED'] } });

  res.status(200).json({
    success: true,
    count: loans.length,
    data: loans,
    summary: {
      totalLoans,
      activeLoans,
      pendingApprovals,
    },
  });
});

/**
 * @desc    Get loan details
 * @route   GET /api/loans/:id
 * @access  Private
 */
exports.getLoanDetails = asyncHandler(async (req, res) => {
  const loan = await EmployeeLoan.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('loanTypeId')
    .populate('employeeId', 'firstName lastName employeeCode email designation department')
    .populate('parentUnitId', 'unitCode unitName unitType');

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: 'Loan not found',
    });
  }

  // Check access: Employee can only see their own loans
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({
      email: req.user.email,
      tenantId: req.tenantId,
    });
    if (loan.employeeId._id.toString() !== employee._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own loans',
      });
    }
  }

  // Get approval history
  const approvals = await LoanApproval.find({
    tenantId: req.tenantId,
    loanId: loan._id,
  })
    .populate('approverId', 'name email')
    .sort({ timestamp: 1 });

  res.status(200).json({
    success: true,
    data: {
      loan,
      approvals,
    },
  });
});
