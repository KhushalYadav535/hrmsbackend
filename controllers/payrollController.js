const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const LoanEmiSchedule = require('../models/LoanEmiSchedule');
const AuditLog = require('../models/AuditLog');
const { getLoanDeductions, processLoanEMIDeductions } = require('../utils/loanPayrollIntegration');
const { sendNotification, payrollTemplates } = require('../utils/notificationService');
const mongoose = require('mongoose');

// Helper function to calculate HRA based on location (metro vs non-metro)
const calculateHRA = (basicSalary, location) => {
  const metroCities = ['Mumbai', 'Delhi', 'Kolkata', 'Chennai', 'Bangalore', 'Hyderabad', 'Pune'];
  const isMetro = metroCities.some(city => location.toLowerCase().includes(city.toLowerCase()));
  return Math.round(basicSalary * (isMetro ? 0.5 : 0.4)); // Metro: 50%, Non-Metro: 40%
};

// Helper function to calculate DA (Dearness Allowance) - typically 25% of Basic
const calculateDA = (basicSalary) => {
  return Math.round(basicSalary * 0.25); // 25% of Basic
};

// Helper function to calculate EPF (Employee Provident Fund) - 12% employee + 12% employer on Basic+DA
// BRD Requirement: "Auto-calculate EPF (12% employee + 12% employer on Basic+DA)"
const calculateEPF = (basicSalary, da) => {
  const base = basicSalary + da; // EPF on Basic+DA
  return {
    employee: Math.round(base * 0.12), // Employee: 12%
    employer: Math.round(base * 0.12), // Employer: 12%
    total: Math.round(base * 0.24), // Total: 24%
  };
};

// Helper function to calculate ESI (Employee State Insurance) - 0.75% employee + 3.25% employer (if applicable)
// BRD Requirement: "Calculate contribution (0.75% employee + 3.25% employer)"
const calculateESI = (grossSalary) => {
  // ESI applicable if gross salary <= 21000
  if (grossSalary <= 21000) {
    return {
      employee: Math.round(grossSalary * 0.0075), // Employee: 0.75%
      employer: Math.round(grossSalary * 0.0325), // Employer: 3.25%
      total: Math.round(grossSalary * 0.04), // Total: 4%
    };
  }
  return { employee: 0, employer: 0, total: 0 };
};

// Helper function to calculate Professional Tax (state-wise as per BRD)
// BRD Requirement: "Apply state-specific Professional Tax slabs"
const calculateProfessionalTax = (grossSalary, location) => {
  // State-wise Professional Tax slabs (as per latest regulations)
  const statePTRules = {
    'Maharashtra': [
      { min: 0, max: 5000, tax: 0 },
      { min: 5001, max: 10000, tax: 150 },
      { min: 10001, max: 15000, tax: 175 },
      { min: 15001, max: Infinity, tax: 200 },
    ],
    'Karnataka': [
      { min: 0, max: 10000, tax: 0 },
      { min: 10001, max: 15000, tax: 150 },
      { min: 15001, max: Infinity, tax: 200 },
    ],
    'West Bengal': [
      { min: 0, max: 10000, tax: 0 },
      { min: 10001, max: 15000, tax: 110 },
      { min: 15001, max: 25000, tax: 130 },
      { min: 25001, max: Infinity, tax: 150 },
    ],
    'Tamil Nadu': [
      { min: 0, max: 21000, tax: 0 },
      { min: 21001, max: Infinity, tax: 250 },
    ],
    'Gujarat': [
      { min: 0, max: 5000, tax: 0 },
      { min: 5001, max: 10000, tax: 150 },
      { min: 10001, max: Infinity, tax: 200 },
    ],
    'Delhi': [
      { min: 0, max: 10000, tax: 0 },
      { min: 10001, max: Infinity, tax: 200 },
    ],
    'Kerala': [
      { min: 0, max: 11000, tax: 0 },
      { min: 11001, max: 16000, tax: 120 },
      { min: 16001, max: Infinity, tax: 200 },
    ],
    'Punjab': [
      { min: 0, max: 10000, tax: 0 },
      { min: 10001, max: Infinity, tax: 200 },
    ],
    'Rajasthan': [
      { min: 0, max: 10000, tax: 0 },
      { min: 10001, max: Infinity, tax: 200 },
    ],
    'Uttar Pradesh': [
      { min: 0, max: 10000, tax: 0 },
      { min: 10001, max: Infinity, tax: 200 },
    ],
  };

  // Detect state from location
  let state = 'Maharashtra'; // Default
  const locationLower = (location || '').toLowerCase();
  
  if (locationLower.includes('mumbai') || locationLower.includes('pune') || locationLower.includes('nagpur')) {
    state = 'Maharashtra';
  } else if (locationLower.includes('bangalore') || locationLower.includes('mysore')) {
    state = 'Karnataka';
  } else if (locationLower.includes('kolkata') || locationLower.includes('howrah')) {
    state = 'West Bengal';
  } else if (locationLower.includes('chennai') || locationLower.includes('coimbatore')) {
    state = 'Tamil Nadu';
  } else if (locationLower.includes('ahmedabad') || locationLower.includes('surat')) {
    state = 'Gujarat';
  } else if (locationLower.includes('delhi') || locationLower.includes('noida') || locationLower.includes('gurgaon')) {
    state = 'Delhi';
  } else if (locationLower.includes('kochi') || locationLower.includes('trivandrum')) {
    state = 'Kerala';
  } else if (locationLower.includes('chandigarh') || locationLower.includes('ludhiana')) {
    state = 'Punjab';
  } else if (locationLower.includes('jaipur') || locationLower.includes('udaipur')) {
    state = 'Rajasthan';
  } else if (locationLower.includes('lucknow') || locationLower.includes('kanpur')) {
    state = 'Uttar Pradesh';
  }

  // Get PT rules for the state
  const rules = statePTRules[state] || statePTRules['Maharashtra'];
  
  // Find applicable slab
  for (const rule of rules) {
    if (grossSalary >= rule.min && grossSalary <= rule.max) {
      return rule.tax;
    }
  }
  
  return 0;
};

// Helper function to calculate Income Tax (simplified TDS calculation)
const calculateIncomeTax = (annualSalary) => {
  // Simplified tax calculation (actual calculation is more complex)
  let tax = 0;
  if (annualSalary > 1500000) {
    tax = (annualSalary - 1500000) * 0.30 + 187500; // 30% + previous slabs
  } else if (annualSalary > 1200000) {
    tax = (annualSalary - 1200000) * 0.20 + 112500; // 20% + previous slabs
  } else if (annualSalary > 900000) {
    tax = (annualSalary - 900000) * 0.15 + 37500; // 15% + previous slabs
  } else if (annualSalary > 600000) {
    tax = (annualSalary - 600000) * 0.10 + 7500; // 10% + previous slabs
  } else if (annualSalary > 300000) {
    tax = (annualSalary - 300000) * 0.05; // 5%
  }
  return Math.round(tax / 12); // Monthly TDS
};

// Helper function to calculate LOP (Loss of Pay) days
// BRD Requirement: "Integrate attendance and leave data for LOP calculation"
const calculateLOPDays = async (employeeId, tenantId, month, year) => {
  try {
    const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'].indexOf(month);
    if (monthIndex === -1) return { lopDays: 0, lopDeduction: 0 };

    const startDate = new Date(year, monthIndex, 1);
    const endDate = new Date(year, monthIndex + 1, 0);

    // Get absent days from Attendance
    const absentDays = await Attendance.countDocuments({
      tenantId,
      employeeId,
      date: { $gte: startDate, $lte: endDate },
      status: 'Absent',
    });

    // Get unpaid leave days (LOP leaves)
    // Convert to ObjectId if they're strings, otherwise use as-is
    const tenantObjectId = mongoose.Types.ObjectId.isValid(tenantId) 
      ? (tenantId instanceof mongoose.Types.ObjectId ? tenantId : new mongoose.Types.ObjectId(tenantId))
      : tenantId;
    const employeeObjectId = mongoose.Types.ObjectId.isValid(employeeId)
      ? (employeeId instanceof mongoose.Types.ObjectId ? employeeId : new mongoose.Types.ObjectId(employeeId))
      : employeeId;
    
    const unpaidLeaves = await LeaveRequest.aggregate([
      {
        $match: {
          tenantId: tenantObjectId,
          employeeId: employeeObjectId,
          leaveType: { $in: ['LOP', 'Loss of Pay', 'Unpaid Leave'] },
          status: 'Approved',
          startDate: { $lte: endDate },
          endDate: { $gte: startDate },
        },
      },
      {
        $project: {
          days: {
            $cond: [
              { $and: [{ $lte: ['$startDate', startDate] }, { $gte: ['$endDate', endDate] }] },
              { $dayOfMonth: endDate },
              { $cond: [
                { $lte: ['$startDate', startDate] },
                { $subtract: [{ $dayOfMonth: endDate }, { $subtract: [{ $dayOfMonth: '$startDate' }, 1] }] },
                { $cond: [
                  { $gte: ['$endDate', endDate] },
                  { $subtract: [{ $dayOfMonth: '$endDate' }, { $subtract: [{ $dayOfMonth: startDate }, 1] }] },
                  { $subtract: [{ $dayOfMonth: '$endDate' }, { $subtract: [{ $dayOfMonth: '$startDate' }, 1] }] },
                ]},
              ]},
            ],
          },
        },
      },
    ]);

    const unpaidLeaveDays = unpaidLeaves.reduce((sum, leave) => sum + (leave.days || 0), 0);
    const totalLOPDays = absentDays + unpaidLeaveDays;

    return {
      lopDays: totalLOPDays,
      lopDeduction: 0, // Will be calculated based on daily rate
    };
  } catch (error) {
    console.error('Error calculating LOP days:', error);
    return { lopDays: 0, lopDeduction: 0 };
  }
};

// Helper function to validate processing deadline (25th of month)
// BRD Requirement: "Payroll must be processed by 25th of each month"
const validateProcessingDeadline = (month, year) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];
  const payrollMonthIndex = monthNames.indexOf(month);
  
  if (payrollMonthIndex === -1) {
    return { valid: false, message: 'Invalid month name' };
  }
  
  // Check if processing for current month/year
  if (year === currentYear && payrollMonthIndex === currentMonth) {
    const dayOfMonth = today.getDate();
    if (dayOfMonth > 25) {
      return {
        valid: false,
        message: `Payroll processing deadline (25th) has passed. Current date: ${dayOfMonth}. Processing after deadline requires special approval.`,
        warning: true,
      };
    }
  }
  
  return { valid: true };
};

// @desc    Get all payrolls
// @route   GET /api/payroll
// @access  Private
exports.getPayrolls = async (req, res) => {
  try {
    const { month, year, employeeId, status } = req.query;
    const filter = { tenantId: req.tenantId };

    if (month) filter.month = month;
    if (year) filter.year = parseInt(year);
    if (employeeId) filter.employeeId = employeeId;
    if (status) filter.status = status;

    // Security: Employee can only see their own payrolls
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
    }

    const payrolls = await Payroll.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode department designation')
      .sort({ year: -1, month: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: payrolls.length,
      data: payrolls,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single payroll
// @route   GET /api/payroll/:id
// @access  Private
exports.getPayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('employeeId', 'firstName lastName employeeCode department designation email phone');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    // Security: Employee can only view their own payroll
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({
        email: req.user.email,
        tenantId: req.tenantId,
      });
      if (!employee || payroll.employeeId._id.toString() !== employee._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own payroll.',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: payroll,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create new payroll
// @route   POST /api/payroll
// @access  Private
exports.createPayroll = async (req, res) => {
  try {
    // BRD: Payroll Maker-Checker - Only Maker can create payroll (Checker cannot)
    if (req.user.role === 'Payroll Administrator' && req.user.payrollSubRole === 'Checker') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Payroll Checker can only approve/reject, not create. Only Payroll Maker can create.',
      });
    }

    // Add tenantId to body
    req.body.tenantId = req.tenantId;

    // Check if payroll already exists for this employee for this month/year
    const existingPayroll = await Payroll.findOne({
      tenantId: req.tenantId,
      employeeId: req.body.employeeId,
      month: req.body.month,
      year: req.body.year,
    });

    if (existingPayroll) {
      return res.status(400).json({
        success: false,
        message: 'Payroll already exists for this employee for the specified period',
      });
    }

    // If basic salary is provided but other components are not, calculate them
    if (req.body.basicSalary && !req.body.hra) {
      const employee = await Employee.findById(req.body.employeeId);
      if (employee) {
        // Calculate HRA based on location
        req.body.hra = calculateHRA(req.body.basicSalary, employee.location || '');
        req.body.da = req.body.da || calculateDA(req.body.basicSalary);
      }
    }

    // Calculate EPF and ESI if not provided
    if (req.body.basicSalary) {
      const grossSalary = (req.body.basicSalary || 0) + (req.body.da || 0) + (req.body.hra || 0) + (req.body.allowances || 0);
      
      // EPF calculation
      const epfData = calculateEPF(req.body.basicSalary, req.body.da || 0);
      req.body.pfDeduction = epfData.employee;
      req.body.employerEPF = epfData.employer;

      // ESI calculation
      const esiData = calculateESI(grossSalary);
      req.body.esiDeduction = esiData.employee;
      req.body.employerESI = esiData.employer;

      // Professional Tax
      const employee = await Employee.findById(req.body.employeeId);
      req.body.otherDeductions = calculateProfessionalTax(grossSalary, employee?.location || '');

      // Income Tax
      const annualSalary = grossSalary * 12;
      req.body.incomeTax = calculateIncomeTax(annualSalary);
    }

    // Calculate net salary
    const grossSalary = (req.body.basicSalary || 0) + (req.body.da || 0) + (req.body.hra || 0) + (req.body.allowances || 0);
    const totalDeductions = (req.body.pfDeduction || 0) + (req.body.esiDeduction || 0) + 
                           (req.body.incomeTax || 0) + (req.body.otherDeductions || 0) + 
                           (req.body.lopDeduction || 0) + (req.body.loanDeductions || 0);
    req.body.netSalary = grossSalary - totalDeductions;

    // Set initial status
    req.body.status = req.body.status || 'Draft';
    req.body.makerId = req.user._id;
    req.body.makerName = req.user.name || req.user.email;
    // Note: approvalHistory is not set for Draft status - it will be added when payroll is Submitted

    const payroll = await Payroll.create(req.body);

    res.status(201).json({
      success: true,
      data: payroll,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Process payroll for all employees (bulk processing)
// @route   POST /api/payroll/process
// @access  Private (Payroll Administrator only)
exports.processPayroll = async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required',
      });
    }

    // BRD: Payroll Maker-Checker - Only Maker can process payroll (Checker cannot)
    if (req.user.role === 'Payroll Administrator') {
      if (req.user.payrollSubRole === 'Checker') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Payroll Checker can only approve payroll, not process. Only Payroll Maker can process.',
        });
      }
      // Maker or null (legacy) can process
    } else if (req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Payroll Administrators (Maker) can process payroll.',
      });
    }

    // BRD Requirement: Validate processing deadline
    const deadlineCheck = validateProcessingDeadline(month, year);
    if (!deadlineCheck.valid && deadlineCheck.warning) {
      // Allow processing but log warning
      console.warn('Payroll processing after deadline:', deadlineCheck.message);
    }

    // Get all active employees
    const employees = await Employee.find({
      tenantId: req.tenantId,
      status: 'Active',
    }).sort({ designation: 1, department: 1 });

    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active employees found',
      });
    }

    const processedPayrolls = [];
    const errors = [];
    const summaryByDesignation = {};

    for (const employee of employees) {
      try {
        // Check if payroll already exists
        const existingPayroll = await Payroll.findOne({
          tenantId: req.tenantId,
          employeeId: employee._id,
          month,
          year: parseInt(year),
        });

        if (existingPayroll) {
          errors.push({
            employeeCode: employee.employeeCode,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            error: 'Payroll already exists for this period',
          });
          continue;
        }

        // Validate employee has salary
        if (!employee.salary || employee.salary <= 0) {
          errors.push({
            employeeCode: employee.employeeCode,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            error: 'Employee salary is not set or is 0. Please assign salary to employee.',
          });
          console.warn(`[processPayroll] Employee ${employee.employeeCode} (${employee.firstName} ${employee.lastName}) has no salary or salary is 0`);
          continue;
        }

        // Calculate salary components
        // Use employee.salary (CTC) or employee.ctc if available
        const ctc = employee.salary || employee.ctc || 0;
        if (ctc <= 0) {
          errors.push({
            employeeCode: employee.employeeCode,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            error: 'Employee CTC is not set or is 0. Please assign salary/CTC to employee.',
          });
          continue;
        }

        const basicSalary = ctc * 0.4; // Assuming 40% of CTC is Basic
        const da = calculateDA(basicSalary);
        const hra = calculateHRA(basicSalary, employee.location || '');
        const allowances = (ctc * 0.15) || 0; // 15% allowances
        const grossSalary = basicSalary + da + hra + allowances;

        // Calculate deductions
        const epfData = calculateEPF(basicSalary, da);
        const esiData = calculateESI(grossSalary);
        const professionalTax = calculateProfessionalTax(grossSalary, employee.location || '');
        const annualSalary = grossSalary * 12;
        const incomeTax = calculateIncomeTax(annualSalary);
        
        // BRD Requirement: Loan deductions integration (NEW - Auto-deduct EMI)
        let loanDeductions = 0;
        let loanEMIDetails = [];
        try {
          // Process EMI deductions for current payroll period
          const payrollDate = new Date(year, month - 1, 1); // First day of payroll month
          const loanProcessing = await processLoanEMIDeductions(
            employee._id,
            req.tenantId,
            null, // payrollId will be set after payroll record is created
            payrollDate
          );
          loanDeductions = loanProcessing.totalDeduction;
          loanEMIDetails = loanProcessing.processedLoans;
        } catch (loanError) {
          console.error(`[processPayroll] Error processing loan EMI deductions for ${employee.employeeCode}:`, loanError);
          // Fallback to simple deduction calculation
          try {
            const loanData = await getLoanDeductions(employee._id, req.tenantId);
            loanDeductions = loanData?.totalDeduction || 0;
          } catch (fallbackError) {
            console.error(`[processPayroll] Fallback loan deduction failed:`, fallbackError);
            loanDeductions = 0;
          }
        }
        
        // BRD Requirement: LOP calculation from attendance and leave
        let lopDays = 0;
        let lopDeduction = 0;
        try {
          const lopData = await calculateLOPDays(employee._id, req.tenantId, month, year);
          lopDays = lopData?.lopDays || 0;
          const dailyRate = grossSalary / 30; // Simplified daily rate
          lopDeduction = Math.round(lopDays * dailyRate);
        } catch (lopError) {
          console.error(`[processPayroll] Error calculating LOP for ${employee.employeeCode}:`, lopError);
          lopDays = 0;
          lopDeduction = 0; // Continue with 0 LOP if error
        }
        
        // Total deductions including LOP and loans
        const totalDeductions = epfData.employee + esiData.employee + incomeTax + professionalTax + lopDeduction + loanDeductions;
        const netSalary = Math.round(grossSalary - totalDeductions);

        // Group by designation for summary
        const designation = employee.designation || 'Other';
        if (!summaryByDesignation[designation]) {
          summaryByDesignation[designation] = {
            count: 0,
            totalBasic: 0,
            totalGross: 0,
            totalNet: 0,
          };
        }
        summaryByDesignation[designation].count++;
        summaryByDesignation[designation].totalBasic += basicSalary;
        summaryByDesignation[designation].totalGross += grossSalary;
        summaryByDesignation[designation].totalNet += netSalary;

        // Create payroll record
        const payroll = new Payroll({
          tenantId: req.tenantId,
          employeeId: employee._id,
          month,
          year: parseInt(year),
          basicSalary,
          da,
          hra,
          allowances,
          grossSalary,
          pfDeduction: epfData.employee,
          employerEPF: epfData.employer,
          esiDeduction: esiData.employee,
          employerESI: esiData.employer,
          incomeTax,
          otherDeductions: professionalTax,
          lopDays,
          lopDeduction,
          loanDeductions: loanDeductions,
          loanEMIDetails: loanEMIDetails, // Array of processed EMI details
          arrearsAmount: 0,
          netSalary,
          status: 'Draft',
          makerId: req.user._id,
          makerName: req.user.name || req.user.email,
          employeeDesignation: designation, // Store for grouping
          // Note: approvalHistory is not set for Draft status - it will be added when payroll is Submitted
        });
        
        await payroll.save();

        // Update loan EMI records with payroll ID (if EMI was deducted and payrollId was null)
        if (loanEMIDetails.length > 0 && payroll._id) {
          try {
            // Re-process EMI deductions with actual payroll ID
            const emiUpdate = await processLoanEMIDeductions(
              employee._id,
              req.tenantId,
              payroll._id,
              new Date(year, month - 1, 1)
            );
            // Update loan deductions if different
            if (emiUpdate.totalDeduction !== loanDeductions) {
              payroll.loanDeductions = emiUpdate.totalDeduction;
              payroll.netSalary = Math.round(grossSalary - (epfData.employee + esiData.employee + incomeTax + professionalTax + lopDeduction + emiUpdate.totalDeduction));
              await payroll.save();
            }
          } catch (emiUpdateError) {
            console.error(`[processPayroll] Error updating EMI payroll links:`, emiUpdateError);
            // Continue - this is not critical
          }
        }

        // Debug: Log first payroll record to verify fields
        if (processedPayrolls.length === 0) {
          console.log(`[processPayroll] First payroll record: Basic=${basicSalary}, DA=${da}, HRA=${hra}, Allowances=${allowances}, Gross=${grossSalary}, Net=${netSalary}`);
        }

        processedPayrolls.push({
          employeeId: employee._id,
          employeeCode: employee.employeeCode,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          employeeDesignation: designation,
          payrollId: payroll._id,
          netSalary,
        });

      } catch (error) {
        console.error(`[processPayroll] Error processing payroll for ${employee.employeeCode}:`, error);
        errors.push({
          employeeCode: employee.employeeCode,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          error: error.message || 'Unknown error occurred',
        });
      }
    }

    // BRD Requirement: Send notifications to relevant stakeholders
    // Send notifications to employees (async, don't wait)
    processedPayrolls.forEach(async (payroll) => {
      try {
        const employee = await Employee.findById(payroll.employeeId);
        if (employee && employee.email) {
          await sendNotification({
            to: employee.email,
            channels: ['email'], // Can add 'sms', 'whatsapp' as per BRD
            ...payrollTemplates.payslipGenerated(
              `${employee.firstName} ${employee.lastName}`,
              month,
              year
            ),
            tenantId: req.tenantId,
            userId: req.user._id,
            module: 'Payroll',
            action: 'Payslip Generated',
          });
        }
      } catch (notifError) {
        console.error('Notification error:', notifError);
        // Don't fail payroll processing if notification fails
      }
    });

    // Log summary for debugging
    console.log(`[processPayroll] Summary: ${processedPayrolls.length} processed, ${errors.length} errors, ${employees.length} total employees`);
    if (errors.length > 0) {
      console.log(`[processPayroll] Errors:`, errors.slice(0, 5)); // Log first 5 errors
    }

    // BR-P0-001 Bug 4: Audit trail for payroll processing
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userEmail: req.user.email,
        action: 'Process',
        module: 'Payroll',
        entityType: 'Payroll',
        details: `Payroll processed for ${month} ${year} - ${processedPayrolls.length} records created, ${errors.length} errors`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
        userAgent: req.get('user-agent') || 'Unknown',
        status: 'Success',
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
      // Don't fail payroll processing if audit log fails
    }

    res.status(200).json({
      success: true,
      message: `Processed ${processedPayrolls.length} payroll records${errors.length > 0 ? ` (${errors.length} skipped due to errors)` : ''}`,
      processed: processedPayrolls.length,
      errors: errors.length,
      totalEmployees: employees.length,
      data: {
        processedPayrolls,
        errors: errors.length > 0 ? errors : undefined,
        summaryByDesignation,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get payroll statistics
// @route   GET /api/payroll/stats
// @access  Private (Payroll Admin, HR Admin, Tenant Admin, Finance Admin, Auditor)
exports.getPayrollStats = async (req, res) => {
  try {
    const { month, year } = req.query;
    const filter = { tenantId: req.tenantId };
    
    // Security: Employees and Managers cannot see organization-wide stats
    // They should use individual payroll endpoints
    const adminRoles = ['Payroll Administrator', 'HR Administrator', 'Tenant Admin', 'Finance Administrator', 'Auditor', 'Super Admin'];
    if (!adminRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to view payroll statistics.',
      });
    }
    
    if (month) filter.month = month;
    if (year) filter.year = parseInt(year);

    const payrolls = await Payroll.find(filter)
      .populate('employeeId', 'firstName lastName department designation')
      .sort({ 'employeeId.designation': 1, 'employeeId.department': 1 });

    // Calculate stats by designation
    const statsByDesignation = {};
    payrolls.forEach(payroll => {
      const designation = payroll.employeeId?.designation || 'Other';
      if (!statsByDesignation[designation]) {
        statsByDesignation[designation] = {
          count: 0,
          totalBasic: 0,
          totalDA: 0,
          totalHRA: 0,
          totalAllowances: 0,
          totalGross: 0,
          totalEPF: 0,
          totalESI: 0,
          totalTax: 0,
          totalDeductions: 0,
          totalNet: 0,
        };
      }
      statsByDesignation[designation].count++;
      statsByDesignation[designation].totalBasic += payroll.basicSalary || 0;
      statsByDesignation[designation].totalDA += payroll.da || 0;
      statsByDesignation[designation].totalHRA += payroll.hra || 0;
      statsByDesignation[designation].totalAllowances += payroll.allowances || 0;
      statsByDesignation[designation].totalGross += payroll.grossSalary || 0;
      statsByDesignation[designation].totalEPF += payroll.pfDeduction || 0;
      statsByDesignation[designation].totalESI += payroll.esiDeduction || 0;
      statsByDesignation[designation].totalTax += payroll.incomeTax || 0;
      statsByDesignation[designation].totalDeductions += (payroll.pfDeduction || 0) + (payroll.esiDeduction || 0) + (payroll.incomeTax || 0) + (payroll.otherDeductions || 0);
      statsByDesignation[designation].totalNet += payroll.netSalary || 0;
    });

    // Overall stats
    const totalEmployees = payrolls.length;
    const totalBasic = payrolls.reduce((sum, p) => sum + (p.basicSalary || 0), 0);
    const totalDA = payrolls.reduce((sum, p) => sum + (p.da || 0), 0);
    const totalHRA = payrolls.reduce((sum, p) => sum + (p.hra || 0), 0);
    const totalAllowances = payrolls.reduce((sum, p) => sum + (p.allowances || 0), 0);
    // Calculate totalGross - use grossSalary field if available, otherwise calculate from components
    const totalGross = payrolls.reduce((sum, p) => {
      const gross = p.grossSalary || 0;
      // If grossSalary is 0 or missing, calculate from components
      if (gross === 0 && (p.basicSalary || p.da || p.hra || p.allowances)) {
        return sum + ((p.basicSalary || 0) + (p.da || 0) + (p.hra || 0) + (p.allowances || 0));
      }
      return sum + gross;
    }, 0);
    
    const totalDeductions = payrolls.reduce((sum, p) => sum + (p.pfDeduction || 0) + (p.esiDeduction || 0) + (p.incomeTax || 0) + (p.otherDeductions || 0) + (p.lopDeduction || 0) + (p.loanDeductions || 0), 0);
    const totalNet = payrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0);

    // Debug logging
    console.log(`[getPayrollStats] Calculated totals: Basic=${totalBasic}, DA=${totalDA}, HRA=${totalHRA}, Allowances=${totalAllowances}, Gross=${totalGross}, Deductions=${totalDeductions}, Net=${totalNet}`);
    if (payrolls.length > 0) {
      const sample = payrolls[0];
      console.log(`[getPayrollStats] Sample payroll: Basic=${sample.basicSalary}, DA=${sample.da}, HRA=${sample.hra}, Allowances=${sample.allowances}, GrossSalary=${sample.grossSalary}, CalculatedGross=${(sample.basicSalary || 0) + (sample.da || 0) + (sample.hra || 0) + (sample.allowances || 0)}`);
    }

    // Status breakdown
    const statusBreakdown = {
      Draft: payrolls.filter(p => p.status === 'Draft').length,
      Submitted: payrolls.filter(p => p.status === 'Submitted').length,
      Approved: payrolls.filter(p => p.status === 'Approved').length,
      Rejected: payrolls.filter(p => p.status === 'Rejected').length,
      Processed: payrolls.filter(p => p.status === 'Processed').length,
      Paid: payrolls.filter(p => p.status === 'Paid').length,
    };

    res.status(200).json({
      success: true,
      data: {
        totalEmployees,
        // Individual earnings totals
        totalBasic,
        totalBasicSalary: totalBasic, // Alias for frontend compatibility
        totalDA,
        totalHRA,
        totalAllowances,
        // Gross and Net
        totalGross,
        totalGrossSalary: totalGross, // Alias for frontend compatibility
        totalDeductions,
        totalNet,
        totalNetSalary: totalNet, // Alias for frontend compatibility
        totalNetPayroll: totalNet, // Alias for frontend compatibility
        statusBreakdown,
        byDesignation: statsByDesignation, // Alias for frontend compatibility
        statsByDesignation,
        // Individual deduction totals for charts
        totalEPF: payrolls.reduce((sum, p) => sum + (p.pfDeduction || 0), 0),
        totalESI: payrolls.reduce((sum, p) => sum + (p.esiDeduction || 0), 0),
        totalIncomeTax: payrolls.reduce((sum, p) => sum + (p.incomeTax || 0), 0),
        totalOtherDeductions: payrolls.reduce((sum, p) => sum + (p.otherDeductions || 0) + (p.lopDeduction || 0) + (p.loanDeductions || 0), 0),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Submit payroll for approval (Maker action)
// @route   POST /api/payroll/:id/submit
// @access  Private (Payroll Administrator)
exports.submitPayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    if (payroll.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: `Payroll cannot be submitted. Current status: ${payroll.status}`,
      });
    }

    // BRD: Payroll Maker-Checker - Only Maker can submit (Checker cannot)
    if (req.user.role === 'Payroll Administrator') {
      if (req.user.payrollSubRole === 'Checker') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Payroll Checker can only approve/reject, not submit. Only Payroll Maker can submit.',
        });
      }
    } else if (req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Payroll Administrators (Maker) can submit payroll.',
      });
    }

    // Update status and add to approval history
    payroll.status = 'Submitted';
    payroll.submittedDate = new Date();
    payroll.makerId = req.user._id;
    payroll.makerName = req.user.name || req.user.email;
    payroll.approvalHistory.push({
      action: 'Submitted',
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userRole: req.user.role,
      comments: req.body.comments || 'Submitted for approval',
      timestamp: new Date(),
    });

    await payroll.save();

    // Create audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'Submit',
      module: 'Payroll',
      entityType: 'Payroll',
      entityId: payroll._id,
      details: `Payroll submitted for approval - ${payroll.month} ${payroll.year}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    res.status(200).json({
      success: true,
      data: payroll,
      message: 'Payroll submitted for approval successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Approve payroll (Checker action)
// @route   POST /api/payroll/:id/approve
// @access  Private (Payroll Administrator - different from maker, or Finance Administrator)
exports.approvePayroll = async (req, res) => {
  try {
    // BRD Requirement: Maker-checker - checker must be different from maker
    const payroll = await Payroll.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('employeeId', 'firstName lastName employeeCode');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    // BRD: Payroll Maker-Checker - Only Checker can approve (Maker cannot)
    if (req.user.role === 'Payroll Administrator') {
      if (req.user.payrollSubRole === 'Maker') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Payroll Maker cannot approve payroll. Only Payroll Checker can approve.',
        });
      }
      // Checker or null (legacy) can approve
    }

    const canApprove = req.user.role === 'Payroll Administrator' || 
                      req.user.role === 'Finance Administrator' || 
                      req.user.role === 'Super Admin';

    if (!canApprove) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to approve payroll.',
      });
    }

    // BRD Requirement: Maker-checker - checker must be different from maker
    // Checker can approve Draft payrolls created by different Maker OR Submitted payrolls
    const isMaker = payroll.makerId && payroll.makerId.toString() === req.user._id.toString();
    
    if ((payroll.status === 'Draft' || payroll.status === 'Submitted') && isMaker) {
      return res.status(400).json({
        success: false,
        message: 'Maker cannot approve their own payroll. Another Payroll Administrator must approve.',
      });
    }

    if (payroll.status === 'Draft' && payroll.makerId) {
      // Checker can approve Draft payrolls created by different Maker
      payroll.status = 'Approved';
      payroll.approvedDate = new Date();
      payroll.checkerId = req.user._id;
      payroll.checkerName = req.user.name || req.user.email;
      payroll.approvalHistory.push({
        action: 'Approved',
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userRole: req.user.role,
        comments: req.body.comments || 'Approved by checker (Draft)',
        timestamp: new Date(),
      });
    } else if (payroll.status === 'Submitted') {
      // First approval by checker (Payroll Admin) for Submitted payrolls
      payroll.status = 'Approved';
      payroll.approvedDate = new Date();
      payroll.checkerId = req.user._id;
      payroll.checkerName = req.user.name || req.user.email;
      payroll.approvalHistory.push({
        action: 'Approved',
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userRole: req.user.role,
        comments: req.body.comments || 'Approved by checker',
        timestamp: new Date(),
      });
    } else if (payroll.status === 'Approved' && req.user.role === 'Finance Administrator') {
      // Final approval by Finance Manager before processing
      payroll.status = 'Processed';
      payroll.financeApproverId = req.user._id;
      payroll.financeApproverName = req.user.name || req.user.email;
      payroll.approvalHistory.push({
        action: 'Processed',
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userRole: req.user.role,
        comments: req.body.comments || 'Approved by Finance Manager',
        timestamp: new Date(),
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Payroll cannot be approved. Current status: ${payroll.status}`,
      });
    }

    await payroll.save();

    // Create audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'Approve',
      module: 'Payroll',
      entityType: 'Payroll',
      entityId: payroll._id,
      details: `Payroll approved - ${payroll.month} ${payroll.year}, Status: ${payroll.status}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    // BRD Requirement: Send notification when payroll is processed
    if (payroll.status === 'Processed') {
      try {
        const employee = await Employee.findById(payroll.employeeId);
        if (employee && employee.email) {
          await sendNotification({
            to: employee.email,
            channels: ['email'],
            ...payrollTemplates.payrollProcessed(
              `${employee.firstName} ${employee.lastName}`,
              payroll.month,
              payroll.year,
              payroll.netSalary
            ),
            tenantId: req.tenantId,
            userId: req.user._id,
            module: 'Payroll',
            action: 'Payroll Processed',
          });
        }
      } catch (notifError) {
        console.error('Notification error:', notifError);
      }
    }

    res.status(200).json({
      success: true,
      data: payroll,
      message: 'Payroll approved successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Reject payroll
// @route   POST /api/payroll/:id/reject
// @access  Private (Payroll Administrator, Finance Administrator)
exports.rejectPayroll = async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
      });
    }

    const payroll = await Payroll.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    // BRD: Payroll Maker-Checker - Only Checker can reject (Maker cannot)
    if (req.user.role === 'Payroll Administrator') {
      if (req.user.payrollSubRole === 'Maker') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Payroll Maker cannot reject payroll. Only Payroll Checker can reject.',
        });
      }
    }

    const canReject = req.user.role === 'Payroll Administrator' || 
                     req.user.role === 'Finance Administrator' || 
                     req.user.role === 'Super Admin';

    if (!canReject) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to reject payroll.',
      });
    }

    if (!['Submitted', 'Approved'].includes(payroll.status)) {
      return res.status(400).json({
        success: false,
        message: `Payroll cannot be rejected. Current status: ${payroll.status}`,
      });
    }

    payroll.status = 'Rejected';
    payroll.rejectedDate = new Date();
    payroll.rejectionReason = reason;
    payroll.approvalHistory.push({
      action: 'Rejected',
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userRole: req.user.role,
      comments: reason,
      timestamp: new Date(),
    });

    await payroll.save();

    // Create audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'Reject',
      module: 'Payroll',
      entityType: 'Payroll',
      entityId: payroll._id,
      details: `Payroll rejected - ${payroll.month} ${payroll.year}. Reason: ${reason}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    res.status(200).json({
      success: true,
      data: payroll,
      message: 'Payroll rejected successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update payroll
// @route   PUT /api/payroll/:id
// @access  Private
exports.updatePayroll = async (req, res) => {
  try {
    let payroll = await Payroll.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    // BRD Requirement: Prevent updating if already paid
    if (payroll.status === 'Paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify payroll that has already been paid',
      });
    }

    // BRD: Payroll Maker-Checker - Only Maker can update payroll (Checker cannot)
    if (req.user.role === 'Payroll Administrator' && req.user.payrollSubRole === 'Checker') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Payroll Checker can only approve/reject, not edit. Only Payroll Maker can update.',
      });
    }

    // BRD Requirement: Only allow updates in Draft status
    if (payroll.status !== 'Draft' && !req.body.status) {
      return res.status(400).json({
        success: false,
        message: `Cannot update payroll in ${payroll.status} status. Only Draft payrolls can be modified.`,
      });
    }

    // Update payroll
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'tenantId' && key !== 'employeeId') {
        payroll[key] = req.body[key];
      }
    });

    // Add to approval history if status changed
    if (req.body.status && req.body.status !== payroll.status) {
      payroll.approvalHistory.push({
        action: req.body.status,
        userId: req.user._id,
        userName: req.user.name || req.user.email,
        userRole: req.user.role,
        comments: req.body.comments || 'Payroll updated',
        timestamp: new Date(),
      });
    }

    await payroll.save();

    // Create audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'Update',
      module: 'Payroll',
      entityType: 'Payroll',
      entityId: payroll._id,
      details: `Payroll updated - ${payroll.month} ${payroll.year}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    res.status(200).json({
      success: true,
      data: payroll,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete payroll
// @route   DELETE /api/payroll/:id
// @access  Private (Payroll Administrator only)
exports.deletePayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    // BRD: Payroll Maker-Checker - Only Maker can delete payroll (Checker cannot)
    if (req.user.role === 'Payroll Administrator' && req.user.payrollSubRole === 'Checker') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Payroll Checker can only approve/reject, not delete. Only Payroll Maker can delete.',
      });
    }

    // BRD Requirement: Only allow deletion of Draft payrolls
    if (payroll.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: `Cannot delete payroll in ${payroll.status} status. Only Draft payrolls can be deleted.`,
      });
    }

    await Payroll.findByIdAndDelete(req.params.id);

    // Create audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'Delete',
      module: 'Payroll',
      entityType: 'Payroll',
      entityId: req.params.id,
      details: `Payroll deleted - ${payroll.month} ${payroll.year}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    res.status(200).json({
      success: true,
      message: 'Payroll deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Finalize payroll (Mark as Paid)
// @route   POST /api/payroll/:id/finalize
// @access  Private (Finance Administrator, Payroll Administrator)
exports.finalizePayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('employeeId', 'firstName lastName employeeCode email');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    // BRD Requirement: Only Processed payrolls can be finalized
    if (payroll.status !== 'Processed') {
      return res.status(400).json({
        success: false,
        message: `Payroll must be Processed before finalization. Current status: ${payroll.status}`,
      });
    }

    // Check permissions
    const canFinalize = req.user.role === 'Finance Administrator' || 
                       req.user.role === 'Payroll Administrator' || 
                       req.user.role === 'Super Admin';

    if (!canFinalize) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Finance and Payroll Administrators can finalize payroll.',
      });
    }

    payroll.status = 'Paid';
    payroll.paidDate = new Date();
    payroll.approvalHistory.push({
      action: 'Paid',
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userRole: req.user.role,
      comments: req.body.comments || 'Payroll finalized and marked as paid',
      timestamp: new Date(),
    });

    await payroll.save();

    // BRD Requirement: Send notification to employee
    try {
      const employee = payroll.employeeId;
      if (employee && employee.email) {
        await sendNotification({
          to: employee.email,
          channels: ['email', 'sms'], // Multi-channel as per BRD
          ...payrollTemplates.payrollProcessed(
            `${employee.firstName} ${employee.lastName}`,
            payroll.month,
            payroll.year,
            payroll.netSalary
          ),
          tenantId: req.tenantId,
          userId: req.user._id,
          module: 'Payroll',
          action: 'Payroll Finalized',
        });
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    // Create audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'Finalize',
      module: 'Payroll',
      entityType: 'Payroll',
      entityId: payroll._id,
      details: `Payroll finalized and marked as paid - ${payroll.month} ${payroll.year}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    res.status(200).json({
      success: true,
      data: payroll,
      message: 'Payroll finalized successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
