/**
 * Core Banking System (CBS) Controller
 * BRD Requirement: INT-CBS-007
 * Handles account validation, transaction status confirmation, and failed credit tracking
 */

const CBSService = require('../services/cbsService');
const Employee = require('../models/Employee');
const Payroll = require('../models/Payroll');
const BankTransaction = require('../models/BankTransaction');
const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { createAuditLog } = require('../utils/auditLog');
const crypto = require('crypto');

/**
 * Validate employee bank account
 * BRD: INT-CBS-007 - Validate employee account number and IFSC before enrollment
 */
exports.validateAccount = asyncHandler(async (req, res) => {
  const { accountNumber, ifscCode, accountHolderName, employeeId } = req.body;

  if (!accountNumber || !ifscCode) {
    return res.status(400).json({
      success: false,
      message: 'Account number and IFSC code are required',
    });
  }

  // Get tenant-specific CBS configuration
  const tenant = await Tenant.findById(req.tenantId);
  const cbsConfig = tenant?.integrations?.cbs || {};

  // Initialize CBS service
  const cbsService = new CBSService(cbsConfig);

  // Validate account
  const result = await cbsService.validateAccount(accountNumber, ifscCode, accountHolderName);

  // If employeeId provided, update employee record
  if (employeeId && result.valid) {
    const employee = await Employee.findOne({
      _id: employeeId,
      tenantId: req.tenantId,
    });

    if (employee) {
      employee.bankAccount = accountNumber;
      employee.ifscCode = ifscCode.toUpperCase();
      if (result.accountHolderName) {
        // Update name if provided and matches
        if (result.nameMatch) {
          employee.bankAccountHolderName = result.accountHolderName;
        }
      }
      employee.bankAccountValidated = true;
      employee.bankAccountValidatedDate = new Date();
      await employee.save();

      await createAuditLog({
        tenantId: req.tenantId,
        userId: req.user._id,
        action: 'UPDATE',
        entityType: 'Employee',
        entityId: employee._id,
        description: `Bank account validated: ${accountNumber}`,
      });
    }
  }

  res.status(200).json({
    success: result.valid,
    data: result,
  });
});

/**
 * Get account details (for Indian Bank accounts)
 * BRD: INT-CBS-007 - Auto-fetch account details
 */
exports.getAccountDetails = asyncHandler(async (req, res) => {
  const { accountNumber, ifscCode } = req.query;

  if (!accountNumber) {
    return res.status(400).json({
      success: false,
      message: 'Account number is required',
    });
  }

  const tenant = await Tenant.findById(req.tenantId);
  const cbsConfig = tenant?.integrations?.cbs || {};

  const cbsService = new CBSService(cbsConfig);
  const result = await cbsService.getAccountDetails(accountNumber, ifscCode);

  res.status(200).json({
    success: result.success,
    data: result,
  });
});

/**
 * Confirm transaction status
 * BRD: INT-CBS-007 - Confirm salary credit transactions
 */
exports.confirmTransactionStatus = asyncHandler(async (req, res) => {
  const { transactionReference, transactionDate } = req.body;

  if (!transactionReference) {
    return res.status(400).json({
      success: false,
      message: 'Transaction reference is required',
    });
  }

  // Find transaction record
  const transaction = await BankTransaction.findOne({
    transactionReference,
    tenantId: req.tenantId,
  });

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transaction not found',
    });
  }

  const tenant = await Tenant.findById(req.tenantId);
  const cbsConfig = tenant?.integrations?.cbs || {};

  const cbsService = new CBSService(cbsConfig);
  const result = await cbsService.confirmTransactionStatus(
    transactionReference,
    transactionDate
  );

  // Update transaction record
  if (result.success) {
    transaction.status = result.status === 'Success' ? 'Success' : 
                        result.status === 'Failed' ? 'Failed' : 'Pending';
    transaction.creditDate = result.creditDate ? new Date(result.creditDate) : undefined;
    transaction.utrNumber = result.utrNumber;
    transaction.failureReason = result.failureReason;
    transaction.cbsResponse = result.response;
    transaction.updatedBy = req.user._id;
    await transaction.save();

    // Update payroll status if transaction succeeded
    if (result.status === 'Success') {
      const payroll = await Payroll.findById(transaction.payrollId);
      if (payroll && payroll.status === 'Processed') {
        payroll.status = 'Paid';
        payroll.paidDate = new Date();
        await payroll.save();
      }
    }

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'UPDATE',
      entityType: 'BankTransaction',
      entityId: transaction._id,
      description: `Transaction status confirmed: ${result.status}`,
    });
  }

  res.status(200).json({
    success: result.success,
    data: result,
    transaction: transaction,
  });
});

/**
 * Bulk confirm transaction status
 * BRD: INT-CBS-007 - Track failed credits for reprocessing
 */
exports.bulkConfirmTransactionStatus = asyncHandler(async (req, res) => {
  const { transactionReferences, month, year } = req.body;

  if (!transactionReferences || !Array.isArray(transactionReferences)) {
    return res.status(400).json({
      success: false,
      message: 'Transaction references array is required',
    });
  }

  const tenant = await Tenant.findById(req.tenantId);
  const cbsConfig = tenant?.integrations?.cbs || {};

  const cbsService = new CBSService(cbsConfig);
  const result = await cbsService.bulkConfirmTransactionStatus(transactionReferences);

  // Update transaction records
  if (result.success && result.transactions) {
    for (const txResult of result.transactions) {
      const transaction = await BankTransaction.findOne({
        transactionReference: txResult.transactionReference,
        tenantId: req.tenantId,
      });

      if (transaction) {
        transaction.status = txResult.status === 'Success' ? 'Success' : 
                            txResult.status === 'Failed' ? 'Failed' : 'Pending';
        transaction.creditDate = txResult.creditDate ? new Date(txResult.creditDate) : undefined;
        transaction.utrNumber = txResult.utrNumber;
        transaction.failureReason = txResult.failureReason;
        transaction.cbsResponse = txResult.response || txResult;
        transaction.updatedBy = req.user._id;
        await transaction.save();

        // Update payroll status if transaction succeeded
        if (txResult.status === 'Success') {
          const payroll = await Payroll.findById(transaction.payrollId);
          if (payroll && payroll.status === 'Processed') {
            payroll.status = 'Paid';
            payroll.paidDate = new Date();
            await payroll.save();
          }
        }
      }
    }
  }

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'BankTransaction',
    description: `Bulk transaction status confirmed: ${result.successful} successful, ${result.failed} failed`,
  });

  res.status(200).json({
    success: result.success,
    data: result,
  });
});

/**
 * Get failed transactions for reprocessing
 * BRD: INT-CBS-007 - Track failed credits for reprocessing
 */
exports.getFailedTransactions = asyncHandler(async (req, res) => {
  const { month, year } = req.query;

  const filter = {
    tenantId: req.tenantId,
    status: 'Failed',
  };

  if (month && year) {
    filter.month = month;
    filter.year = parseInt(year);
  }

  const failedTransactions = await BankTransaction.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('payrollId', 'netSalary month year')
    .sort({ transactionDate: -1 });

  res.status(200).json({
    success: true,
    count: failedTransactions.length,
    data: failedTransactions,
  });
});

/**
 * Retry failed transaction
 */
exports.retryFailedTransaction = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;

  const transaction = await BankTransaction.findOne({
    _id: transactionId,
    tenantId: req.tenantId,
    status: 'Failed',
  });

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Failed transaction not found',
    });
  }

  // Increment retry count
  transaction.retryCount += 1;
  transaction.lastRetryDate = new Date();
  transaction.status = 'Pending';
  transaction.updatedBy = req.user._id;
  await transaction.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'BankTransaction',
    entityId: transaction._id,
    description: `Retry failed transaction: ${transaction.transactionReference}`,
  });

  res.status(200).json({
    success: true,
    message: 'Transaction marked for retry',
    data: transaction,
  });
});

/**
 * Get transaction history for an account
 */
exports.getTransactionHistory = asyncHandler(async (req, res) => {
  const { accountNumber, fromDate, toDate, limit } = req.query;

  if (!accountNumber) {
    return res.status(400).json({
      success: false,
      message: 'Account number is required',
    });
  }

  const tenant = await Tenant.findById(req.tenantId);
  const cbsConfig = tenant?.integrations?.cbs || {};

  const cbsService = new CBSService(cbsConfig);
  const result = await cbsService.getTransactionHistory(
    accountNumber,
    fromDate,
    toDate,
    parseInt(limit) || 100
  );

  res.status(200).json({
    success: result.success,
    data: result,
  });
});

/**
 * Generate transaction reference for bank file
 */
exports.generateTransactionReference = (employeeCode, month, year, index) => {
  const timestamp = Date.now();
  const hash = crypto.createHash('md5')
    .update(`${employeeCode}-${month}-${year}-${index}-${timestamp}`)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();
  
  return `SAL-${month.substring(0, 3).toUpperCase()}-${year}-${hash}`;
};
