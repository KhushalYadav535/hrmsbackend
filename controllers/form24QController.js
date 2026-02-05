/**
 * Form 24Q Controller
 * BRD Requirement: BR-INT-TRACES-003, BR-TAX-006, BR-TAX-009
 * Handles Form 24Q generation, validation, upload to TRACES, and Form 16 Part A download
 */

const Form24Q = require('../models/Form24Q');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');
const TRACESService = require('../services/tracesService');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const fs = require('fs').promises;
const path = require('path');

/**
 * Generate Form 24Q
 * BRD: BR-TAX-006 - Generate Form 24Q for quarterly TDS return
 */
exports.generateForm24Q = asyncHandler(async (req, res) => {
  const { financialYear, quarter } = req.body;

  if (!financialYear || !quarter) {
    return res.status(400).json({
      success: false,
      message: 'Financial year and quarter are required',
    });
  }

  if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid quarter. Must be Q1, Q2, Q3, or Q4',
    });
  }

  // Check if Form 24Q already exists
  let form24Q = await Form24Q.findOne({
    tenantId: req.tenantId,
    financialYear,
    quarter,
  });

  if (form24Q && form24Q.status !== 'Draft') {
    return res.status(400).json({
      success: false,
      message: `Form 24Q for ${financialYear} ${quarter} already exists with status: ${form24Q.status}`,
    });
  }

  // Get tenant details
  const tenant = await Tenant.findById(req.tenantId);

  // Calculate quarter months
  const quarterMonths = {
    Q1: ['April', 'May', 'June'],
    Q2: ['July', 'August', 'September'],
    Q3: ['October', 'November', 'December'],
    Q4: ['January', 'February', 'March'],
  };

  const months = quarterMonths[quarter];
  const year = quarter === 'Q4' ? parseInt(financialYear.split('-')[1]) : parseInt(financialYear.split('-')[0]);

  // Get all payrolls for the quarter
  const payrolls = await Payroll.find({
    tenantId: req.tenantId,
    month: { $in: months },
    year: year,
    status: { $in: ['Processed', 'Paid'] },
  }).populate('employeeId', 'firstName lastName pan employeeCode');

  if (payrolls.length === 0) {
    return res.status(404).json({
      success: false,
      message: `No payroll data found for ${financialYear} ${quarter}`,
    });
  }

  // Group by employee and calculate TDS
  const employeeTdsMap = new Map();

  payrolls.forEach(payroll => {
    const employeeId = payroll.employeeId._id.toString();
    const pan = payroll.employeeId?.pan || '';
    const name = `${payroll.employeeId?.firstName || ''} ${payroll.employeeId?.lastName || ''}`.trim();

    if (!employeeTdsMap.has(employeeId)) {
      employeeTdsMap.set(employeeId, {
        employeeId: payroll.employeeId._id,
        pan,
        name,
        sectionCode: '192', // 192 = Salary
        tdsAmount: 0,
        tdsDeposited: 0,
        challanDetails: [],
      });
    }

    const empTds = employeeTdsMap.get(employeeId);
    empTds.tdsAmount += payroll.incomeTax || 0;
    empTds.tdsDeposited += payroll.incomeTax || 0; // Assuming TDS is deposited monthly
  });

  const employeeTdsDetails = Array.from(employeeTdsMap.values()).map((emp, index) => ({
    ...emp,
    srNo: index + 1,
  }));

  // Calculate totals
  const totalTdsAmount = employeeTdsDetails.reduce((sum, emp) => sum + emp.tdsAmount, 0);
  const totalTdsDeposited = employeeTdsDetails.reduce((sum, emp) => sum + emp.tdsDeposited, 0);

  // Prepare Form 24Q data
  const form24QData = {
    tenantId: req.tenantId,
    financialYear,
    quarter,
    employerDetails: {
      tan: tenant?.tan || process.env.TRACES_TAN || '',
      name: tenant?.name || '',
      address: tenant?.address || '',
      state: tenant?.state || '',
      pinCode: tenant?.pinCode || '',
      email: tenant?.email || '',
      phone: tenant?.phone || '',
    },
    employeeTdsDetails,
    totalTdsAmount,
    totalTdsDeposited,
    totalChallans: 0, // Will be updated when challan details are added
    status: 'Generated',
    generatedDate: new Date(),
    generatedBy: req.user._id,
  };

  // Save or update Form 24Q
  if (form24Q) {
    Object.assign(form24Q, form24QData);
    await form24Q.save();
  } else {
    form24Q = await Form24Q.create(form24QData);
  }

  // Generate JSON using TRACES service
  const tenantTracesConfig = tenant?.integrations?.traces || {};
  const tracesService = new TRACESService(tenantTracesConfig);
  const jsonData = await tracesService.generateForm24QJSON(form24QData);

  // Save JSON file URL
  form24Q.jsonFileUrl = jsonData.fileName;
  await form24Q.save();

  // Log generation
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Form 24Q Generated',
    module: 'Tax',
    entityType: 'Form24Q',
    entityId: form24Q._id,
    details: `Form 24Q generated for ${financialYear} ${quarter}. Employees: ${employeeTdsDetails.length}, Total TDS: ₹${totalTdsAmount}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    data: {
      form24Q: form24Q.toObject(),
      jsonData: {
        fileName: jsonData.fileName,
        recordCount: jsonData.recordCount,
        fileHash: jsonData.fileHash,
      },
    },
    message: 'Form 24Q generated successfully',
  });
});

/**
 * Validate Form 24Q using FVU
 * BRD: BR-INT-TRACES-003 - Validate using FVU utility
 */
exports.validateForm24Q = asyncHandler(async (req, res) => {
  const { form24QId } = req.params;

  const form24Q = await Form24Q.findOne({
    _id: form24QId,
    tenantId: req.tenantId,
  });

  if (!form24Q) {
    return res.status(404).json({
      success: false,
      message: 'Form 24Q not found',
    });
  }

  if (form24Q.status !== 'Generated') {
    return res.status(400).json({
      success: false,
      message: `Form 24Q must be in Generated status. Current status: ${form24Q.status}`,
    });
  }

  // Get tenant TRACES configuration
  const tenant = await Tenant.findById(req.tenantId);
  const tracesConfig = tenant?.integrations?.traces || {};
  const tracesService = new TRACESService(tracesConfig);

  // Generate JSON if not already generated
  let jsonFilePath;
  if (form24Q.jsonFileUrl) {
    jsonFilePath = path.join(process.env.TEMP_DIR || path.join(__dirname, '../../temp'), form24Q.jsonFileUrl);
  } else {
    const jsonData = await tracesService.generateForm24QJSON(form24Q.toObject());
    jsonFilePath = path.join(process.env.TEMP_DIR || path.join(__dirname, '../../temp'), jsonData.fileName);
    await fs.writeFile(jsonFilePath, jsonData.jsonContent, 'utf8');
    form24Q.jsonFileUrl = jsonData.fileName;
    await form24Q.save();
  }

  // Validate using FVU
  const validationResult = await tracesService.validateWithFVU(jsonFilePath);

  // Log validation
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Form 24Q Validated',
    module: 'Tax',
    entityType: 'Form24Q',
    entityId: form24Q._id,
    details: `Form 24Q validation: ${validationResult.valid ? 'PASSED' : 'FAILED'}. Errors: ${validationResult.errors?.length || 0}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: validationResult.valid ? 'Success' : 'Failed',
  });

  res.status(200).json({
    success: true,
    data: validationResult,
    message: validationResult.valid ? 'Form 24Q validation passed' : 'Form 24Q validation failed',
  });
});

/**
 * Upload Form 24Q to TRACES portal
 * BRD: BR-INT-TRACES-003 - Upload quarterly TDS returns
 */
exports.uploadForm24Q = asyncHandler(async (req, res) => {
  const { form24QId } = req.params;

  const form24Q = await Form24Q.findOne({
    _id: form24QId,
    tenantId: req.tenantId,
  });

  if (!form24Q) {
    return res.status(404).json({
      success: false,
      message: 'Form 24Q not found',
    });
  }

  if (form24Q.status !== 'Generated') {
    return res.status(400).json({
      success: false,
      message: `Form 24Q must be in Generated status. Current status: ${form24Q.status}`,
    });
  }

  // Get tenant TRACES configuration
  const tenant = await Tenant.findById(req.tenantId);
  const tracesConfig = tenant?.integrations?.traces || {};
  const tracesService = new TRACESService(tracesConfig);

  // Ensure JSON file exists
  let jsonFilePath;
  if (form24Q.jsonFileUrl) {
    jsonFilePath = path.join(process.env.TEMP_DIR || path.join(__dirname, '../../temp'), form24Q.jsonFileUrl);
  } else {
    const jsonData = await tracesService.generateForm24QJSON(form24Q.toObject());
    jsonFilePath = path.join(process.env.TEMP_DIR || path.join(__dirname, '../../temp'), jsonData.fileName);
    await fs.mkdir(path.dirname(jsonFilePath), { recursive: true });
    await fs.writeFile(jsonFilePath, jsonData.jsonContent, 'utf8');
    form24Q.jsonFileUrl = jsonData.fileName;
    await form24Q.save();
  }

  // Upload to TRACES
  const uploadResult = await tracesService.uploadForm24Q(
    jsonFilePath,
    form24Q.financialYear,
    form24Q.quarter
  );

  // Update Form 24Q status
  form24Q.status = 'Uploaded';
  form24Q.uploadedDate = new Date();
  form24Q.tracesAcknowledgmentNumber = uploadResult.acknowledgmentNumber;
  await form24Q.save();

  // Log upload
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Form 24Q Uploaded',
    module: 'Tax',
    entityType: 'Form24Q',
    entityId: form24Q._id,
    details: `Form 24Q uploaded to TRACES. Acknowledgment: ${uploadResult.acknowledgmentNumber}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    data: {
      form24Q: form24Q.toObject(),
      uploadResult,
    },
    message: 'Form 24Q uploaded successfully to TRACES',
  });
});

/**
 * Download Form 16 Part A from TRACES
 * BRD: BR-INT-TRACES-003 - Download Form 16 Part A after processing
 */
exports.downloadForm16PartA = asyncHandler(async (req, res) => {
  const { form24QId, employeePan } = req.query;

  if (!form24QId || !employeePan) {
    return res.status(400).json({
      success: false,
      message: 'Form24Q ID and employee PAN are required',
    });
  }

  const form24Q = await Form24Q.findOne({
    _id: form24QId,
    tenantId: req.tenantId,
  });

  if (!form24Q) {
    return res.status(404).json({
      success: false,
      message: 'Form 24Q not found',
    });
  }

  if (!form24Q.tracesAcknowledgmentNumber) {
    return res.status(400).json({
      success: false,
      message: 'Form 24Q has not been uploaded to TRACES yet',
    });
  }

  // Get tenant TRACES configuration
  const tenant = await Tenant.findById(req.tenantId);
  const tracesConfig = tenant?.integrations?.traces || {};
  const tracesService = new TRACESService(tracesConfig);

  // Download Form 16 Part A
  const downloadResult = await tracesService.downloadForm16PartA(
    form24Q.tracesAcknowledgmentNumber,
    form24Q.financialYear,
    employeePan
  );

  if (!downloadResult.success) {
    return res.status(404).json({
      success: false,
      message: downloadResult.message || 'Form 16 Part A not available',
    });
  }

  // Send file
  const fileBuffer = await fs.readFile(downloadResult.filePath);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadResult.fileName}"`);
  res.send(fileBuffer);

  // Clean up temp file
  await fs.unlink(downloadResult.filePath).catch(() => {});

  // Log download
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || req.user.email,
    userEmail: req.user.email,
    action: 'Form 16 Part A Downloaded',
    module: 'Tax',
    entityType: 'Form16',
    details: `Form 16 Part A downloaded for PAN: ${employeePan}, FY: ${form24Q.financialYear}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
    status: 'Success',
  });
});

/**
 * Get Form 24Q
 */
exports.getForm24Q = asyncHandler(async (req, res) => {
  const { form24QId } = req.params;

  const form24Q = await Form24Q.findOne({
    _id: form24QId,
    tenantId: req.tenantId,
  }).populate('employeeTdsDetails.employeeId', 'firstName lastName pan employeeCode');

  if (!form24Q) {
    return res.status(404).json({
      success: false,
      message: 'Form 24Q not found',
    });
  }

  res.status(200).json({
    success: true,
    data: form24Q,
  });
});

/**
 * List Form 24Q records
 */
exports.getForm24Qs = asyncHandler(async (req, res) => {
  const { financialYear, quarter, status } = req.query;

  const filter = { tenantId: req.tenantId };
  if (financialYear) filter.financialYear = financialYear;
  if (quarter) filter.quarter = quarter;
  if (status) filter.status = status;

  const form24Qs = await Form24Q.find(filter)
    .sort({ financialYear: -1, quarter: -1, createdAt: -1 });

  res.status(200).json({
    success: true,
    count: form24Qs.length,
    data: form24Qs,
  });
});

/**
 * Check TRACES upload status
 */
exports.checkTRACESStatus = asyncHandler(async (req, res) => {
  const { form24QId } = req.params;

  const form24Q = await Form24Q.findOne({
    _id: form24QId,
    tenantId: req.tenantId,
  });

  if (!form24Q) {
    return res.status(404).json({
      success: false,
      message: 'Form 24Q not found',
    });
  }

  if (!form24Q.tracesAcknowledgmentNumber) {
    return res.status(400).json({
      success: false,
      message: 'Form 24Q has not been uploaded to TRACES yet',
    });
  }

  // Get tenant TRACES configuration
  const tenant = await Tenant.findById(req.tenantId);
  const tracesConfig = tenant?.integrations?.traces || {};
  const tracesService = new TRACESService(tracesConfig);

  // Check status
  const statusResult = await tracesService.checkUploadStatus(form24Q.tracesAcknowledgmentNumber);

  // Update Form 24Q status if processed
  if (statusResult.success && statusResult.status === 'Processed') {
    form24Q.status = 'Acknowledged';
    await form24Q.save();
  }

  res.status(200).json({
    success: true,
    data: statusResult,
  });
});
