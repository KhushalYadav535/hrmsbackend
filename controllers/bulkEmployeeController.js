const bulkEmployeeService = require('../services/bulkEmployeeService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const AuditLog = require('../models/AuditLog');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'bulk-import-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .xlsx, .xls, and .csv files are allowed.'));
    }
  },
});

/**
 * Bulk Employee Import/Export Controller
 * BRD: BR-P0-006
 */

// @desc    Download import template
// @route   GET /api/employees/bulk/template
// @access  Private (HR Administrator, Tenant Admin)
exports.downloadTemplate = asyncHandler(async (req, res) => {
  try {
    const buffer = await bulkEmployeeService.generateImportTemplate(req.tenantId);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=employee-import-template.xlsx');
    res.send(buffer);
    
    // Log audit
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'Download Import Template',
      module: 'Personnel',
      entityType: 'Employee',
      details: 'Downloaded bulk employee import template',
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      status: 'Success',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating template',
      error: error.message,
    });
  }
});

// @desc    Validate import file
// @route   POST /api/employees/bulk/validate
// @access  Private (HR Administrator, Tenant Admin)
exports.validateImport = asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }
    
    const validationResult = await bulkEmployeeService.processImportFile(
      req.file.path,
      req.tenantId
    );
    
    // Store validation result in session or return it
    // For now, return it directly
    res.json({
      success: true,
      data: {
        totalRows: validationResult.totalRows,
        validRows: validationResult.validRows.length,
        invalidRows: validationResult.invalidRows.length,
        validationResults: validationResult.validationResults.map(r => ({
          rowIndex: r.rowIndex,
          employeeCode: r.row['Employee Code'],
          errors: r.errors,
          warnings: r.warnings,
          isValid: r.isValid,
        })),
      },
      filePath: req.file.path, // Store file path for actual import
    });
    
    // Log audit
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'Validate Bulk Import',
      module: 'Personnel',
      entityType: 'Employee',
      details: `Validated ${validationResult.totalRows} rows: ${validationResult.validRows.length} valid, ${validationResult.invalidRows.length} invalid`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      status: 'Success',
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: error.message,
    });
  }
});

// @desc    Import employees
// @route   POST /api/employees/bulk/import
// @access  Private (HR Administrator, Tenant Admin)
exports.importEmployees = asyncHandler(async (req, res) => {
  try {
    const { filePath, importValidOnly = true } = req.body;
    
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({
        success: false,
        message: 'File not found. Please validate the file first.',
      });
    }
    
    // Re-validate file
    const validationResult = await bulkEmployeeService.processImportFile(
      filePath,
      req.tenantId
    );
    
    // Get valid rows
    const rowsToImport = importValidOnly
      ? validationResult.validRows
      : validationResult.validationResults.filter(r => r.isValid);
    
    if (rowsToImport.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows to import',
        validationResults: validationResult.validationResults,
      });
    }
    
    // Import employees
    const importResult = await bulkEmployeeService.importEmployees(
      rowsToImport,
      req.tenantId,
      req.user._id
    );
    
    // Clean up file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.json({
      success: true,
      data: {
        totalProcessed: rowsToImport.length,
        imported: importResult.imported.length,
        failed: importResult.failed.length,
        importedEmployees: importResult.imported,
        failedEmployees: importResult.failed,
      },
    });
    
    // Log audit
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'Bulk Import Employees',
      module: 'Personnel',
      entityType: 'Employee',
      details: `Imported ${importResult.imported.length} employees, ${importResult.failed.length} failed`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      status: 'Success',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Import failed',
      error: error.message,
    });
  }
});

// @desc    Export employees
// @route   POST /api/employees/bulk/export
// @access  Private (HR Administrator, Tenant Admin, Auditor)
exports.exportEmployees = asyncHandler(async (req, res) => {
  try {
    const {
      exportType = 'complete', // complete, basic, statutory, payroll
      department,
      status,
      location,
      startDate,
      endDate,
    } = req.body;
    
    const filters = {
      department,
      status,
      location,
      startDate,
      endDate,
    };
    
    const buffer = await bulkEmployeeService.exportEmployees(
      req.tenantId,
      filters,
      exportType
    );
    
    const filename = `employees-export-${Date.now()}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
    
    // Log audit
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'Bulk Export Employees',
      module: 'Personnel',
      entityType: 'Employee',
      details: `Exported employees: type=${exportType}, filters=${JSON.stringify(filters)}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      status: 'Success',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Export failed',
      error: error.message,
    });
  }
});

// Export multer upload middleware
exports.upload = upload.single('file');
