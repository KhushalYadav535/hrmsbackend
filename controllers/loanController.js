const Loan = require('../models/Loan');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');

// @desc    Get all loans
// @route   GET /api/loans
// @access  Private
exports.getLoans = async (req, res) => {
  try {
    const { employeeId, status, loanType } = req.query;
    const filter = { tenantId: req.tenantId };

    // Security: Employee can only see their own loans
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({
        email: req.user.email,
        tenantId: req.tenantId,
      });
      if (employee) {
        filter.employeeId = employee._id;
      } else {
        return res.status(404).json({
          success: false,
          message: 'Employee record not found',
        });
      }
    } else if (employeeId) {
      filter.employeeId = employeeId;
    }

    if (status) filter.status = status;
    if (loanType) filter.loanType = loanType;

    const loans = await Loan.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: loans.length,
      data: loans,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get active loan deductions for employee (for payroll)
// @route   GET /api/loans/deductions/:employeeId
// @access  Private (Internal - called by payroll processing)
exports.getLoanDeductions = async (employeeId, tenantId) => {
  try {
    const activeLoans = await Loan.find({
      tenantId,
      employeeId,
      status: 'Active',
    });

    // Calculate total EMI for active loans
    const totalEMI = activeLoans.reduce((sum, loan) => sum + (loan.emiAmount || 0), 0);
    
    return {
      totalDeduction: totalEMI,
      loans: activeLoans.map(loan => ({
        loanId: loan._id,
        loanType: loan.loanType,
        emiAmount: loan.emiAmount,
        principalBalance: loan.principalBalance,
      })),
    };
  } catch (error) {
    console.error('Error getting loan deductions:', error);
    return { totalDeduction: 0, loans: [] };
  }
};

// @desc    Create loan
// @route   POST /api/loans
// @access  Private (HR Administrator, Finance Administrator)
exports.createLoan = async (req, res) => {
  try {
    // BRD Requirement: Only HR/Finance Admin can create loans
    if (req.user.role !== 'HR Administrator' && 
        req.user.role !== 'Finance Administrator' && 
        req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only HR and Finance Administrators can create loans.',
      });
    }

    const loan = await Loan.create({
      ...req.body,
      tenantId: req.tenantId,
      principalBalance: req.body.loanAmount,
      approvedBy: req.user._id,
      approvedDate: new Date(),
    });

    // Create audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'Create',
      module: 'Loan',
      entityType: 'Loan',
      entityId: loan._id,
      details: `Loan created: ${loan.loanType} - ₹${loan.loanAmount}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    res.status(201).json({
      success: true,
      data: loan,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update loan (record EMI payment)
// @route   PUT /api/loans/:id
// @access  Private (HR Administrator, Finance Administrator)
exports.updateLoan = async (req, res) => {
  try {
    const loan = await Loan.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
      });
    }

    // Update principal paid when EMI is deducted
    if (req.body.emiPaid) {
      loan.principalPaid = (loan.principalPaid || 0) + req.body.emiPaid;
      loan.principalBalance = loan.loanAmount - loan.principalPaid;
      
      // Auto-close if fully paid
      if (loan.principalBalance <= 0) {
        loan.status = 'Closed';
        loan.principalBalance = 0;
      }
    }

    if (req.body.status) loan.status = req.body.status;
    if (req.body.remarks) loan.remarks = req.body.remarks;

    await loan.save();

    res.status(200).json({
      success: true,
      data: loan,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
