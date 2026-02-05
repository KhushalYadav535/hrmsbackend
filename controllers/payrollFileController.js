const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const Tenant = require('../models/Tenant');
const BankTransaction = require('../models/BankTransaction');
const EPFOService = require('../services/epfoService');
const ESICService = require('../services/esicService');
const CBSService = require('../services/cbsService');
const { generateTransactionReference } = require('./cbsController');
const fs = require('fs');
const path = require('path');
const { createAuditLog } = require('../utils/auditLog');

// @desc    Generate Bank File (NEFT/RTGS/Internal)
// @route   GET /api/payroll/bank-file/generate
// @access  Private (Payroll Administrator, Finance Administrator)
// BRD Requirement: "Generate NEFT/RTGS bulk upload files", "Support internal transfer format"
exports.generateBankFile = async (req, res) => {
  try {
    const { month, year, format = 'NEFT' } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required',
      });
    }

    // BRD Requirement: Only Payroll Admin or Finance Admin can generate bank files
    if (req.user.role !== 'Payroll Administrator' && 
        req.user.role !== 'Finance Administrator' && 
        req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Payroll and Finance Administrators can generate bank files.',
      });
    }

    // Get all processed/paid payrolls for the month
    const payrolls = await Payroll.find({
      tenantId: req.tenantId,
      month,
      year: parseInt(year),
      status: { $in: ['Processed', 'Paid'] },
    }).populate('employeeId', 'firstName lastName bankAccount ifscCode employeeCode');

    if (payrolls.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No processed payroll records found for the specified period',
      });
    }

    let fileContent = '';
    let fileName = '';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    if (format === 'NEFT') {
      // NEFT Format: Bank-specific format (simplified - actual format depends on bank)
      // Format: Account Number|IFSC|Amount|Beneficiary Name|Remarks
      fileName = `NEFT_${month}_${year}_${timestamp}.txt`;
      
      fileContent = payrolls.map(payroll => {
        const employee = payroll.employeeId;
        const accountNo = employee?.bankAccount || '';
        const ifsc = employee?.ifscCode || '';
        const amount = payroll.netSalary || 0;
        const beneficiaryName = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim();
        const remarks = `SALARY-${month}-${year}-${employee?.employeeCode || ''}`;
        
        return `${accountNo}|${ifsc}|${amount}|${beneficiaryName}|${remarks}`;
      }).join('\n');

    } else if (format === 'RTGS') {
      // RTGS Format: Similar to NEFT but for amounts >= ₹2 lakh
      fileName = `RTGS_${month}_${year}_${timestamp}.txt`;
      
      fileContent = payrolls
        .filter(p => (p.netSalary || 0) >= 200000)
        .map(payroll => {
          const employee = payroll.employeeId;
          const accountNo = employee?.bankAccount || '';
          const ifsc = employee?.ifscCode || '';
          const amount = payroll.netSalary || 0;
          const beneficiaryName = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim();
          const remarks = `SALARY-${month}-${year}-${employee?.employeeCode || ''}`;
          
          return `${accountNo}|${ifsc}|${amount}|${beneficiaryName}|${remarks}`;
        }).join('\n');

    } else if (format === 'INTERNAL') {
      // Internal Transfer Format (Indian Bank specific)
      // Format: Employee Code|Account Number|Amount|Narration
      fileName = `INTERNAL_${month}_${year}_${timestamp}.txt`;
      
      fileContent = payrolls.map(payroll => {
        const employee = payroll.employeeId;
        const employeeCode = employee?.employeeCode || '';
        const accountNo = employee?.bankAccount || '';
        const amount = payroll.netSalary || 0;
        const narration = `SALARY-${month}-${year}`;
        
        return `${employeeCode}|${accountNo}|${amount}|${narration}`;
      }).join('\n');

    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid format. Supported formats: NEFT, RTGS, INTERNAL',
      });
    }

    // Get tenant-specific CBS configuration
    const tenant = await Tenant.findById(req.tenantId);
    const cbsConfig = tenant?.integrations?.cbs || {};
    const cbsService = new CBSService(cbsConfig);

    // Validate account numbers and IFSC codes using CBS
    const invalidRecords = [];
    const validationResults = [];

    for (let index = 0; index < payrolls.length; index++) {
      const payroll = payrolls[index];
      const employee = payroll.employeeId;
      
      if (!employee?.bankAccount || !employee?.ifscCode) {
        invalidRecords.push({
          employeeCode: employee?.employeeCode || 'N/A',
          employeeName: `${employee?.firstName || ''} ${employee?.lastName || ''}`,
          issue: !employee?.bankAccount ? 'Missing bank account' : 'Missing IFSC code',
        });
        continue;
      }

      // Validate account via CBS
      try {
        const validationResult = await cbsService.validateAccount(
          employee.bankAccount,
          employee.ifscCode,
          `${employee.firstName} ${employee.lastName}`
        );

        validationResults.push({
          employeeCode: employee.employeeCode,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          accountNumber: employee.bankAccount,
          ifscCode: employee.ifscCode,
          valid: validationResult.valid,
          message: validationResult.message,
        });

        if (!validationResult.valid) {
          invalidRecords.push({
            employeeCode: employee.employeeCode,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            accountNumber: employee.bankAccount,
            ifscCode: employee.ifscCode,
            issue: validationResult.message || 'Account validation failed',
          });
        }
      } catch (error) {
        // If CBS validation fails, still allow file generation but log warning
        console.warn(`CBS validation failed for ${employee.employeeCode}:`, error.message);
        validationResults.push({
          employeeCode: employee.employeeCode,
          valid: false,
          message: 'CBS validation unavailable',
        });
      }
    }

    if (invalidRecords.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some employees have invalid bank account details',
        invalidRecords,
        validationResults,
      });
    }

    // Generate transaction references and create BankTransaction records
    const transactionReferences = [];
    for (let index = 0; index < payrolls.length; index++) {
      const payroll = payrolls[index];
      const employee = payroll.employeeId;
      const transactionRef = generateTransactionReference(
        employee.employeeCode,
        month,
        year,
        index
      );
      transactionReferences.push(transactionRef);

      // Create BankTransaction record
      await BankTransaction.create({
        tenantId: req.tenantId,
        payrollId: payroll._id,
        employeeId: employee._id,
        employeeCode: employee.employeeCode,
        transactionReference: transactionRef,
        accountNumber: employee.bankAccount,
        ifscCode: employee.ifscCode,
        amount: payroll.netSalary || 0,
        transactionType: format,
        status: 'Pending',
        transactionDate: new Date(),
        month: month,
        year: parseInt(year),
        remarks: `SALARY-${month}-${year}-${employee.employeeCode}`,
        createdBy: req.user._id,
      });
    }

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'CREATE',
      entityType: 'BankFile',
      description: `Bank file generated: ${format} for ${month} ${year}, ${payrolls.length} transactions`,
    });

    // Return file content (in production, save to file system or cloud storage)
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileContent);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Generate EPFO ECR File
// @route   GET /api/payroll/ecr/generate
// @access  Private (Payroll Administrator only)
// BRD Requirement: "Generate ECR file in EPFO-specified format"
exports.generateECRFile = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required',
      });
    }

    if (req.user.role !== 'Payroll Administrator' && req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Payroll Administrators can generate ECR files.',
      });
    }

    // Get payrolls with EPF contributions
    const payrolls = await Payroll.find({
      tenantId: req.tenantId,
      month,
      year: parseInt(year),
      status: { $in: ['Processed', 'Paid'] },
    }).populate('employeeId', 'firstName lastName employeeCode pfNumber uan');

    // Get tenant EPFO configuration
    const tenant = await Tenant.findById(req.tenantId);
    const epfoConfig = tenant?.integrations?.epfo || {};
    
    // Initialize EPFO Service
    const epfoService = new EPFOService(epfoConfig);

    // Generate ECR file using EPFO service
    const ecrData = await epfoService.generateECRFile(payrolls, month, parseInt(year));

    // Store ECR generation record (optional - can be stored in database)
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'ECR File Generated',
      module: 'Payroll',
      entityType: 'EPFO',
      entityId: null,
      details: `ECR file generated for ${month} ${year}. Records: ${ecrData.recordCount}, Total EPF: ₹${ecrData.totalEPF}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    // Return file for download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${ecrData.fileName}"`);
    res.send(ecrData.fileContent);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Upload ECR file to EPFO portal
// @route   POST /api/payroll/ecr/upload
// @access  Private (Payroll Administrator only)
// BRD Requirement: BR-INT-EPFO-001 - Upload to EPFO portal via SFTP
exports.uploadECRFile = async (req, res) => {
  try {
    const { month, year, fileContent, fileName } = req.body;

    if (!month || !year || !fileContent || !fileName) {
      return res.status(400).json({
        success: false,
        message: 'Month, year, fileContent, and fileName are required',
      });
    }

    if (req.user.role !== 'Payroll Administrator' && req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Payroll Administrators can upload ECR files.',
      });
    }

    // Get tenant EPFO configuration
    const tenant = await Tenant.findById(req.tenantId);
    const epfoConfig = tenant?.integrations?.epfo || {};
    
    // Initialize EPFO Service
    const epfoService = new EPFOService(epfoConfig);

    // Upload to EPFO portal
    const uploadResult = await epfoService.uploadECRFile(fileContent, fileName);

    // Log upload
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'ECR File Uploaded',
      module: 'Payroll',
      entityType: 'EPFO',
      details: `ECR file uploaded to EPFO portal: ${uploadResult.remoteFilePath}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    res.status(200).json({
      success: true,
      data: uploadResult,
      message: 'ECR file uploaded successfully to EPFO portal',
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'ECR upload failed',
      error: error.message,
    });
  }
};

// @desc    Download EPFO acknowledgment
// @route   GET /api/payroll/ecr/acknowledgment
// @access  Private (Payroll Administrator only)
// BRD Requirement: BR-INT-EPFO-001 - Download acknowledgment and challan
exports.downloadEPFOAcknowledgment = async (req, res) => {
  try {
    const { fileName, month, year } = req.query;

    if (!fileName || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'FileName, month, and year are required',
      });
    }

    if (req.user.role !== 'Payroll Administrator' && req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Payroll Administrators can download acknowledgments.',
      });
    }

    // Get tenant EPFO configuration
    const tenant = await Tenant.findById(req.tenantId);
    const epfoConfig = tenant?.integrations?.epfo || {};
    
    // Initialize EPFO Service
    const epfoService = new EPFOService(epfoConfig);

    // Download acknowledgment
    const ackResult = await epfoService.downloadAcknowledgment(fileName, month, parseInt(year));

    res.status(200).json({
      success: true,
      data: ackResult,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to download acknowledgment',
      error: error.message,
    });
  }
};

// @desc    Validate UAN numbers
// @route   POST /api/payroll/ecr/validate-uan
// @access  Private (Payroll Administrator only)
// BRD Requirement: BR-INT-EPFO-001 - Validate UAN numbers in real-time
exports.validateUAN = async (req, res) => {
  try {
    const { uan } = req.body;

    if (!uan) {
      return res.status(400).json({
        success: false,
        message: 'UAN is required',
      });
    }

    if (req.user.role !== 'Payroll Administrator' && req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Payroll Administrators can validate UANs.',
      });
    }

    // Get tenant EPFO configuration
    const tenant = await Tenant.findById(req.tenantId);
    const epfoConfig = tenant?.integrations?.epfo || {};
    
    // Initialize EPFO Service
    const epfoService = new EPFOService(epfoConfig);

    // Validate UAN
    const validationResult = await epfoService.validateUAN(uan);

    res.status(200).json({
      success: true,
      data: validationResult,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'UAN validation failed',
      error: error.message,
    });
  }
};

// @desc    Bulk validate UANs
// @route   POST /api/payroll/ecr/validate-uans
// @access  Private (Payroll Administrator only)
exports.bulkValidateUANs = async (req, res) => {
  try {
    const { uans } = req.body;

    if (!uans || !Array.isArray(uans) || uans.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'UANs array is required',
      });
    }

    if (req.user.role !== 'Payroll Administrator' && req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Payroll Administrators can validate UANs.',
      });
    }

    // Get tenant EPFO configuration
    const tenant = await Tenant.findById(req.tenantId);
    const epfoConfig = tenant?.integrations?.epfo || {};
    
    // Initialize EPFO Service
    const epfoService = new EPFOService(epfoConfig);

    // Bulk validate UANs
    const results = await epfoService.validateUANs(uans);

    res.status(200).json({
      success: true,
      data: {
        results,
        total: results.length,
        valid: results.filter(r => r.valid).length,
        invalid: results.filter(r => !r.valid).length,
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Bulk UAN validation failed',
      error: error.message,
    });
  }
};

// @desc    Generate ESIC Monthly Return File
// @route   GET /api/payroll/esic/generate
// @access  Private (Payroll Administrator only)
// BRD Requirement: "Generate monthly return in ESIC format"
exports.generateESICFile = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required',
      });
    }

    if (req.user.role !== 'Payroll Administrator' && req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Payroll Administrators can generate ESIC files.',
      });
    }

    // Get payrolls with ESI contributions (Gross <= ₹21,000)
    const payrolls = await Payroll.find({
      tenantId: req.tenantId,
      month,
      year: parseInt(year),
      status: { $in: ['Processed', 'Paid'] },
    }).populate('employeeId', 'firstName lastName employeeCode esiNumber');

    // Get tenant ESIC configuration
    const tenant = await Tenant.findById(req.tenantId);
    const esicConfig = tenant?.integrations?.esic || {};
    
    // Initialize ESIC Service
    const esicService = new ESICService(esicConfig);

    // Generate ESIC file using ESIC service
    const esicData = await esicService.generateESICFile(payrolls, month, parseInt(year));

    // Log generation
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'ESIC File Generated',
      module: 'Payroll',
      entityType: 'ESIC',
      details: `ESIC file generated for ${month} ${year}. Records: ${esicData.recordCount}, Total Contribution: ₹${esicData.totalContribution}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    // Return file for download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${esicData.fileName}"`);
    res.send(esicData.fileContent);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Upload ESIC return file to portal
// @route   POST /api/payroll/esic/upload
// @access  Private (Payroll Administrator only)
// BRD Requirement: BR-INT-ESIC-002 - Submit monthly returns via portal
exports.uploadESICFile = async (req, res) => {
  try {
    const { month, year, fileContent, fileName } = req.body;

    if (!month || !year || !fileContent || !fileName) {
      return res.status(400).json({
        success: false,
        message: 'Month, year, fileContent, and fileName are required',
      });
    }

    if (req.user.role !== 'Payroll Administrator' && req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Payroll Administrators can upload ESIC files.',
      });
    }

    // Get tenant ESIC configuration
    const tenant = await Tenant.findById(req.tenantId);
    const esicConfig = tenant?.integrations?.esic || {};
    
    // Initialize ESIC Service
    const esicService = new ESICService(esicConfig);

    // Upload to ESIC portal
    const uploadResult = await esicService.uploadESICFile(fileContent, fileName, month, parseInt(year));

    // Log upload
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      action: 'ESIC File Uploaded',
      module: 'Payroll',
      entityType: 'ESIC',
      details: `ESIC return uploaded to portal. Return Number: ${uploadResult.returnNumber}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.get('user-agent') || 'Unknown',
      status: 'Success',
    });

    res.status(200).json({
      success: true,
      data: uploadResult,
      message: 'ESIC return uploaded successfully',
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'ESIC upload failed',
      error: error.message,
    });
  }
};

// @desc    Track ESIC payment status
// @route   GET /api/payroll/esic/payment-status
// @access  Private (Payroll Administrator only)
// BRD Requirement: BR-INT-ESIC-002 - Track contribution payments
exports.getESICPaymentStatus = async (req, res) => {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required',
      });
    }

    if (req.user.role !== 'Payroll Administrator' && req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Payroll Administrators can check payment status.',
      });
    }

    // Get tenant ESIC configuration
    const tenant = await Tenant.findById(req.tenantId);
    const esicConfig = tenant?.integrations?.esic || {};
    
    // Initialize ESIC Service
    const esicService = new ESICService(esicConfig);

    // Track payment status
    const paymentStatus = await esicService.trackPaymentStatus(month, parseInt(year));

    res.status(200).json({
      success: true,
      data: paymentStatus,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get payment status',
      error: error.message,
    });
  }
};
