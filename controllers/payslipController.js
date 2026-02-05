const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const fs = require('fs');
const path = require('path');

// @desc    Generate Payslip PDF
// @route   GET /api/payroll/payslip/:id/pdf
// @access  Private
// BRD Requirement: "Processed salary data, payslips (PDF)"
exports.generatePayslipPDF = async (req, res) => {
  try {
    const payroll = await Payroll.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('employeeId', 'firstName lastName employeeCode department designation email phone bankAccount ifscCode');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    // Security: Employee can only view their own payslip
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({
        email: req.user.email,
        tenantId: req.tenantId,
      });
      if (!employee || payroll.employeeId._id.toString() !== employee._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own payslip.',
        });
      }
    }

    // Only generate PDF for Processed or Paid payrolls
    if (!['Processed', 'Paid'].includes(payroll.status)) {
      return res.status(400).json({
        success: false,
        message: `Payslip can only be generated for Processed or Paid payroll. Current status: ${payroll.status}`,
      });
    }

    const employee = payroll.employeeId;
    const grossSalary = (payroll.basicSalary || 0) + (payroll.da || 0) + (payroll.hra || 0) + (payroll.allowances || 0);
    const totalDeductions = (payroll.pfDeduction || 0) + (payroll.esiDeduction || 0) + 
                           (payroll.incomeTax || 0) + (payroll.otherDeductions || 0) + 
                           (payroll.lopDeduction || 0) + (payroll.loanDeductions || 0);

    // Generate HTML payslip (can be converted to PDF using libraries like puppeteer or pdfkit)
    // For now, returning structured data that frontend can convert to PDF
    const payslipData = {
      employee: {
        name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
        employeeCode: employee.employeeCode || '',
        department: employee.department || '',
        designation: employee.designation || '',
        email: employee.email || '',
        phone: employee.phone || '',
      },
      payroll: {
        month: payroll.month,
        year: payroll.year,
        payDate: payroll.paidDate || payroll.generatedDate,
        status: payroll.status,
      },
      earnings: {
        basicSalary: payroll.basicSalary || 0,
        da: payroll.da || 0,
        hra: payroll.hra || 0,
        allowances: payroll.allowances || 0,
        total: grossSalary,
      },
      deductions: {
        pf: payroll.pfDeduction || 0,
        esi: payroll.esiDeduction || 0,
        incomeTax: payroll.incomeTax || 0,
        professionalTax: payroll.otherDeductions || 0,
        lop: payroll.lopDeduction || 0,
        loans: payroll.loanDeductions || 0,
        total: totalDeductions,
      },
      employerContributions: {
        epf: payroll.employerEPF || 0,
        esi: payroll.employerESI || 0,
      },
      summary: {
        grossSalary,
        totalDeductions,
        netSalary: payroll.netSalary || 0,
        lopDays: payroll.lopDays || 0,
      },
      bankDetails: {
        accountNumber: employee.bankAccount || '',
        ifscCode: employee.ifscCode || '',
      },
    };

    // In production, use PDF library (pdfkit, puppeteer, etc.) to generate actual PDF
    // For now, return structured data
    res.status(200).json({
      success: true,
      data: payslipData,
      message: 'Payslip data generated successfully. Use PDF library to convert to PDF.',
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
