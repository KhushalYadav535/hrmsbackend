/**
 * Loan Payroll Integration Utility
 * BRD Requirement: BR-P0-004 - Staff Loans & Advances Module
 * Automatically deducts EMI from active loans during payroll processing
 */

const EmployeeLoan = require('../models/EmployeeLoan');
const LoanEmiSchedule = require('../models/LoanEmiSchedule');
const Payroll = require('../models/Payroll');

/**
 * Get active loan EMI deductions for employee (for payroll)
 * @param {ObjectId} employeeId - Employee ID
 * @param {ObjectId} tenantId - Tenant ID
 * @returns {Object} { totalDeduction, loans: Array }
 */
async function getLoanDeductions(employeeId, tenantId) {
  try {
    const activeLoans = await EmployeeLoan.find({
      tenantId,
      employeeId,
      status: { $in: ['ACTIVE', 'DISBURSED'] },
    }).populate('loanTypeId', 'loanName loanCode');

    // Calculate total EMI for active loans
    const totalEMI = activeLoans.reduce((sum, loan) => sum + (loan.emiAmount || 0), 0);
    
    return {
      totalDeduction: totalEMI,
      loans: activeLoans.map(loan => ({
        loanId: loan._id,
        loanType: loan.loanTypeId?.loanName || 'Unknown',
        emiAmount: loan.emiAmount,
        outstandingAmount: loan.outstandingAmount,
      })),
    };
  } catch (error) {
    console.error('Error getting loan deductions:', error);
    return { totalDeduction: 0, loans: [] };
  }
}

/**
 * Process loan EMI deductions during payroll
 * Marks EMI as PAID, updates outstanding amount, updates loan status
 * @param {ObjectId} employeeId - Employee ID
 * @param {ObjectId} tenantId - Tenant ID
 * @param {ObjectId} payrollId - Payroll record ID (can be null initially)
 * @param {Date} payrollDate - Payroll date (for EMI due date matching)
 * @returns {Object} { processedLoans: Array, totalDeduction: number }
 */
async function processLoanEMIDeductions(employeeId, tenantId, payrollId, payrollDate) {
  try {
    const activeLoans = await EmployeeLoan.find({
      tenantId,
      employeeId,
      status: { $in: ['ACTIVE', 'DISBURSED'] },
    }).populate('loanTypeId', 'loanName');

    const processedLoans = [];
    let totalDeduction = 0;

    for (const loan of activeLoans) {
      // Find pending EMI for current month
      const currentMonth = payrollDate.getMonth();
      const currentYear = payrollDate.getFullYear();
      
      const pendingEMI = await LoanEmiSchedule.findOne({
        tenantId,
        loanId: loan._id,
        status: 'PENDING',
        dueDate: {
          $gte: new Date(currentYear, currentMonth, 1),
          $lt: new Date(currentYear, currentMonth + 1, 1),
        },
      });

      if (pendingEMI) {
        // Mark EMI as PAID
        pendingEMI.status = 'PAID';
        pendingEMI.paidDate = payrollDate;
        pendingEMI.paidAmount = pendingEMI.emiAmount;
        if (payrollId) {
          pendingEMI.payrollId = payrollId;
        }
        await pendingEMI.save();

        // Update loan outstanding amount
        loan.outstandingAmount = Math.max(0, loan.outstandingAmount - pendingEMI.principalAmount);
        
        // Update loan status to ACTIVE if it was DISBURSED
        if (loan.status === 'DISBURSED') {
          loan.status = 'ACTIVE';
        }

        // Check if loan is fully paid
        const remainingEMIs = await LoanEmiSchedule.countDocuments({
          tenantId,
          loanId: loan._id,
          status: 'PENDING',
        });

        if (remainingEMIs === 0 && loan.outstandingAmount <= 0) {
          loan.status = 'CLOSED';
          loan.closureDate = payrollDate;
          loan.outstandingAmount = 0;
        }

        await loan.save();

        totalDeduction += pendingEMI.emiAmount;
        processedLoans.push({
          loanId: loan._id,
          loanType: loan.loanTypeId?.loanName || 'Unknown',
          emiAmount: pendingEMI.emiAmount,
          emiNumber: pendingEMI.emiNumber,
          outstandingAmount: loan.outstandingAmount,
          status: loan.status,
        });
      } else {
        // No EMI due this month, but still add to total if loan is active
        // (for cases where EMI schedule hasn't been generated yet)
        if (loan.emiAmount > 0) {
          totalDeduction += loan.emiAmount;
        }
      }
    }

    return {
      processedLoans,
      totalDeduction,
    };
  } catch (error) {
    console.error('Error processing loan EMI deductions:', error);
    // Fallback: return simple EMI calculation
    const fallback = await getLoanDeductions(employeeId, tenantId);
    return { processedLoans: [], totalDeduction: fallback.totalDeduction };
  }
}

module.exports = {
  getLoanDeductions,
  processLoanEMIDeductions,
};
