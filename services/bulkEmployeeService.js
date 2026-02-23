const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Employee = require('../models/Employee');
const EmployeeBankAccount = require('../models/EmployeeBankAccount');
const EmployeeEmergencyContact = require('../models/EmployeeEmergencyContact');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const AuditLog = require('../models/AuditLog');

/**
 * Bulk Employee Import/Export Service
 * BRD: BR-P0-006
 */
class BulkEmployeeService {
  /**
   * Generate import template Excel file
   */
  async generateImportTemplate(tenantId) {
    const workbook = new ExcelJS.Workbook();
    
    // Sheet 1: Employee Master Data
    const employeeSheet = workbook.addWorksheet('Employee Master Data');
    
    // Define headers
    const headers = [
      'Employee Code',
      'First Name',
      'Middle Name',
      'Last Name',
      'Date of Birth (DD-MM-YYYY)',
      'Gender (M/F/Other)',
      'Personal Email',
      'Mobile Number (10 digits)',
      'PAN Number',
      'Aadhaar Number (12 digits)',
      'Joining Date (DD-MM-YYYY)',
      'Department Code',
      'Designation Code',
      'Grade',
      'Reporting Manager Code',
      'Salary',
      'CTC',
      'Bank Name',
      'Account Number',
      'IFSC Code',
      'UAN (12 digits)',
      'Blood Group (A+/A-/B+/B-/O+/O-/AB+/AB-)',
      'Marital Status (Single/Married/Divorced/Widowed)',
      'Emergency Contact Name',
      'Emergency Contact Number',
      'Address',
      'Location',
      'Status (Active/Inactive/On Leave/Retired)',
    ];
    
    // Add headers
    employeeSheet.addRow(headers);
    
    // Style header row
    employeeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    employeeSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    employeeSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Set column widths
    employeeSheet.columns.forEach((column, index) => {
      column.width = headers[index].length + 5;
    });
    
    // Add sample data row
    const sampleRow = [
      'EMP001',
      'John',
      'Kumar',
      'Doe',
      '15-05-1990',
      'M',
      'john.doe@example.com',
      '9876543210',
      'ABCDE1234F',
      '123456789012',
      '01-04-2024',
      'IT',
      'SOFTWARE_ENGINEER',
      'L4',
      'EMP002',
      '50000',
      '800000',
      'State Bank of India',
      '1234567890123456',
      'SBIN0001234',
      '123456789012',
      'O+',
      'Married',
      'Jane Doe',
      '9876543211',
      '123 Main Street, City',
      'Mumbai',
      'Active',
    ];
    employeeSheet.addRow(sampleRow);
    
    // Add data validation for Gender
    employeeSheet.getColumn(6).eachCell((cell, rowNumber) => {
      if (rowNumber > 1) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['"M,F,Other"']
        };
      }
    });
    
    // Sheet 2: Validation Reference Data
    const referenceSheet = workbook.addWorksheet('Validation Reference');
    
    // Get departments and designations
    const departments = await Department.find({ tenantId }).select('name').lean();
    const designations = await Designation.find({ tenantId }).select('name grade').lean();
    
    // Department codes
    referenceSheet.addRow(['Department Codes']);
    referenceSheet.addRow(['Code', 'Name']);
    departments.forEach(dept => {
      referenceSheet.addRow([dept.name, dept.name]);
    });
    
    // Designation codes
    referenceSheet.addRow([]);
    referenceSheet.addRow(['Designation Codes']);
    referenceSheet.addRow(['Code', 'Name', 'Grade']);
    designations.forEach(desg => {
      referenceSheet.addRow([desg.name, desg.name, desg.grade || '']);
    });
    
    // Style reference sheet
    referenceSheet.getRow(1).font = { bold: true };
    referenceSheet.getRow(2).font = { bold: true };
    
    // Generate file buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  /**
   * Validate employee data row
   */
  async validateEmployeeRow(row, rowIndex, tenantId, existingEmployees, existingEmails, existingPANs) {
    const errors = [];
    const warnings = [];
    
    // Required fields
    const requiredFields = {
      'Employee Code': row['Employee Code'],
      'First Name': row['First Name'],
      'Last Name': row['Last Name'],
      'Date of Birth (DD-MM-YYYY)': row['Date of Birth (DD-MM-YYYY)'],
      'Gender (M/F/Other)': row['Gender (M/F/Other)'],
      'Personal Email': row['Personal Email'],
      'Mobile Number (10 digits)': row['Mobile Number (10 digits)'],
      'PAN Number': row['PAN Number'],
      'Joining Date (DD-MM-YYYY)': row['Joining Date (DD-MM-YYYY)'],
      'Department Code': row['Department Code'],
      'Designation Code': row['Designation Code'],
      'Grade': row['Grade'],
      'Salary': row['Salary'],
      'CTC': row['CTC'],
      'Bank Name': row['Bank Name'],
      'Account Number': row['Account Number'],
      'IFSC Code': row['IFSC Code'],
    };
    
    // Check required fields
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        errors.push(`${field} is required`);
      }
    }
    
    // Validate Employee Code uniqueness
    const empCode = row['Employee Code']?.toString().trim();
    if (empCode) {
      if (existingEmployees.has(empCode)) {
        errors.push(`Employee Code ${empCode} already exists`);
      }
      existingEmployees.add(empCode);
    }
    
    // Validate Email format and uniqueness
    const email = row['Personal Email']?.toString().trim().toLowerCase();
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push(`Invalid email format: ${email}`);
      }
      if (existingEmails.has(email)) {
        errors.push(`Email ${email} already exists`);
      }
      existingEmails.add(email);
    }
    
    // Validate PAN format and uniqueness
    const pan = row['PAN Number']?.toString().trim().toUpperCase();
    if (pan) {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(pan)) {
        errors.push(`Invalid PAN format: ${pan} (Expected: ABCDE1234F)`);
      }
      if (existingPANs.has(pan)) {
        errors.push(`PAN ${pan} already exists`);
      }
      existingPANs.add(pan);
    }
    
    // Validate Aadhaar (if provided)
    const aadhaar = row['Aadhaar Number (12 digits)']?.toString().trim();
    if (aadhaar && aadhaar.length !== 12) {
      errors.push(`Aadhaar must be exactly 12 digits`);
    }
    
    // Validate Mobile Number
    const mobile = row['Mobile Number (10 digits)']?.toString().trim();
    if (mobile && !/^[0-9]{10}$/.test(mobile)) {
      errors.push(`Mobile number must be exactly 10 digits`);
    }
    
    // Validate Date formats
    const dob = row['Date of Birth (DD-MM-YYYY)']?.toString().trim();
    if (dob) {
      const dobDate = this.parseDate(dob);
      if (!dobDate) {
        errors.push(`Invalid Date of Birth format: ${dob} (Expected: DD-MM-YYYY)`);
      }
    }
    
    const joinDate = row['Joining Date (DD-MM-YYYY)']?.toString().trim();
    if (joinDate) {
      const joinDateParsed = this.parseDate(joinDate);
      if (!joinDateParsed) {
        errors.push(`Invalid Joining Date format: ${joinDate} (Expected: DD-MM-YYYY)`);
      }
    }
    
    // Validate Department exists
    const deptCode = row['Department Code']?.toString().trim();
    if (deptCode) {
      const dept = await Department.findOne({ tenantId, name: deptCode });
      if (!dept) {
        errors.push(`Department ${deptCode} does not exist`);
      }
    }
    
    // Validate Designation exists
    const desgCode = row['Designation Code']?.toString().trim();
    if (desgCode) {
      const desg = await Designation.findOne({ tenantId, name: desgCode });
      if (!desg) {
        errors.push(`Designation ${desgCode} does not exist`);
      }
    }
    
    // Validate IFSC Code format
    const ifsc = row['IFSC Code']?.toString().trim().toUpperCase();
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      errors.push(`Invalid IFSC code format: ${ifsc}`);
    }
    
    // Validate Gender
    const gender = row['Gender (M/F/Other)']?.toString().trim().toUpperCase();
    if (gender && !['M', 'F', 'OTHER'].includes(gender)) {
      errors.push(`Invalid Gender: ${gender} (Expected: M, F, or Other)`);
    }
    
    // Validate Salary and CTC are numbers
    const salary = parseFloat(row['Salary']);
    const ctc = parseFloat(row['CTC']);
    if (isNaN(salary) || salary <= 0) {
      errors.push(`Salary must be a positive number`);
    }
    if (isNaN(ctc) || ctc <= 0) {
      errors.push(`CTC must be a positive number`);
    }
    
    return { errors, warnings };
  }

  /**
   * Parse date from DD-MM-YYYY format
   */
  parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const date = new Date(year, month, day);
    if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
      return null; // Invalid date
    }
    return date;
  }

  /**
   * Process Excel/CSV file and validate data
   */
  async processImportFile(filePath, tenantId) {
    const extension = path.extname(filePath).toLowerCase();
    let rows = [];
    
    if (extension === '.xlsx' || extension === '.xls') {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(worksheet);
    } else if (extension === '.csv') {
      rows = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    } else {
      throw new Error('Unsupported file format. Please use .xlsx, .xls, or .csv');
    }
    
    if (rows.length === 0) {
      throw new Error('File is empty or contains no data');
    }
    
    if (rows.length > 10000) {
      throw new Error('File contains more than 10,000 records. Maximum allowed is 10,000');
    }
    
    // Get existing employees for duplicate checking
    const existingEmployees = await Employee.find({ tenantId })
      .select('employeeCode email panNumber')
      .lean();
    
    const existingEmpCodes = new Set(existingEmployees.map(e => e.employeeCode));
    const existingEmails = new Set(existingEmployees.map(e => e.email?.toLowerCase()).filter(Boolean));
    const existingPANs = new Set();
    
    // Decrypt PANs for comparison (if needed)
    for (const emp of existingEmployees) {
      if (emp.panNumber) {
        try {
          const { decrypt } = require('../utils/encryption');
          const decrypted = decrypt(emp.panNumber);
          existingPANs.add(decrypted);
        } catch {
          // If decryption fails, skip
        }
      }
    }
    
    // Validate all rows
    const validationResults = [];
    const processedEmpCodes = new Set();
    const processedEmails = new Set();
    const processedPANs = new Set();
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2; // +2 because Excel rows start at 1 and header is row 1
      
      const { errors, warnings } = await this.validateEmployeeRow(
        row,
        rowIndex,
        tenantId,
        processedEmpCodes,
        processedEmails,
        processedPANs
      );
      
      // Also check against existing employees
      const empCode = row['Employee Code']?.toString().trim();
      if (empCode && existingEmpCodes.has(empCode)) {
        errors.push(`Employee Code ${empCode} already exists in system`);
      }
      
      const email = row['Personal Email']?.toString().trim().toLowerCase();
      if (email && existingEmails.has(email)) {
        errors.push(`Email ${email} already exists in system`);
      }
      
      const pan = row['PAN Number']?.toString().trim().toUpperCase();
      if (pan && existingPANs.has(pan)) {
        errors.push(`PAN ${pan} already exists in system`);
      }
      
      validationResults.push({
        rowIndex,
        row,
        errors,
        warnings,
        isValid: errors.length === 0,
      });
    }
    
    return {
      totalRows: rows.length,
      validRows: validationResults.filter(r => r.isValid),
      invalidRows: validationResults.filter(r => !r.isValid),
      validationResults,
    };
  }

  /**
   * Import validated employees
   */
  async importEmployees(validRows, tenantId, importedBy) {
    const imported = [];
    const failed = [];
    
    for (const result of validRows) {
      try {
        const row = result.row;
        
        // Parse dates
        const dob = this.parseDate(row['Date of Birth (DD-MM-YYYY)']);
        const joinDate = this.parseDate(row['Joining Date (DD-MM-YYYY)']);
        
        // Map gender
        const genderMap = {
          'M': 'Male',
          'F': 'Female',
          'OTHER': 'Other',
        };
        const gender = genderMap[row['Gender (M/F/Other)']?.toString().trim().toUpperCase()] || 'Other';
        
        // Map marital status
        const maritalStatus = row['Marital Status (Single/Married/Divorced/Widowed)']?.toString().trim() || 'Single';
        
        // Get reporting manager
        let reportingManagerId = null;
        if (row['Reporting Manager Code']) {
          const manager = await Employee.findOne({
            tenantId,
            employeeCode: row['Reporting Manager Code'].toString().trim(),
          });
          if (manager) {
            reportingManagerId = manager._id;
          }
        }
        
        // Create employee
        const employee = await Employee.create({
          tenantId,
          employeeCode: row['Employee Code'].toString().trim(),
          firstName: row['First Name'].toString().trim(),
          middleName: row['Middle Name']?.toString().trim() || '',
          lastName: row['Last Name'].toString().trim(),
          email: row['Personal Email'].toString().trim().toLowerCase(),
          phone: row['Mobile Number (10 digits)'].toString().trim(),
          dateOfBirth: dob,
          gender,
          joinDate,
          designation: row['Designation Code'].toString().trim(),
          department: row['Department Code'].toString().trim(),
          reportingManager: reportingManagerId,
          salary: parseFloat(row['Salary']),
          ctc: parseFloat(row['CTC']),
          panNumber: row['PAN Number']?.toString().trim().toUpperCase(),
          aadhaarNumber: row['Aadhaar Number (12 digits)']?.toString().trim(),
          uanNumber: row['UAN (12 digits)']?.toString().trim(),
          bloodGroup: row['Blood Group (A+/A-/B+/B-/O+/O-/AB+/AB-)']?.toString().trim(),
          maritalStatus,
          address: row['Address']?.toString().trim(),
          location: row['Location']?.toString().trim() || 'Mumbai',
          status: row['Status (Active/Inactive/On Leave/Retired)']?.toString().trim() || 'Active',
        });
        
        // Create bank account
        if (row['Bank Name'] && row['Account Number'] && row['IFSC Code']) {
          await EmployeeBankAccount.create({
            tenantId,
            employeeId: employee._id,
            bankName: row['Bank Name'].toString().trim(),
            accountNumber: row['Account Number'].toString().trim(),
            ifscCode: row['IFSC Code'].toString().trim().toUpperCase(),
            isPrimary: true,
          });
        }
        
        // Create emergency contact
        if (row['Emergency Contact Name'] && row['Emergency Contact Number']) {
          await EmployeeEmergencyContact.create({
            tenantId,
            employeeId: employee._id,
            name: row['Emergency Contact Name'].toString().trim(),
            relationship: 'Other',
            phone: row['Emergency Contact Number'].toString().trim(),
            isPrimary: true,
          });
        }
        
        imported.push({
          rowIndex: result.rowIndex,
          employeeCode: employee.employeeCode,
          name: `${employee.firstName} ${employee.lastName}`,
        });
        
        // Log audit
        await AuditLog.create({
          tenantId,
          userId: importedBy,
          action: 'Bulk Import Employee',
          module: 'Personnel',
          entityType: 'Employee',
          entityId: employee._id,
          details: `Employee imported via bulk import: ${employee.employeeCode}`,
          ipAddress: 'System',
          status: 'Success',
        });
      } catch (error) {
        failed.push({
          rowIndex: result.rowIndex,
          employeeCode: row['Employee Code']?.toString().trim(),
          error: error.message,
        });
      }
    }
    
    return { imported, failed };
  }

  /**
   * Export employees to Excel
   */
  async exportEmployees(tenantId, filters = {}, exportType = 'complete') {
    const query = { tenantId };
    
    // Apply filters
    if (filters.department) query.department = filters.department;
    if (filters.status) query.status = filters.status;
    if (filters.location) query.location = filters.location;
    if (filters.startDate || filters.endDate) {
      query.joinDate = {};
      if (filters.startDate) query.joinDate.$gte = new Date(filters.startDate);
      if (filters.endDate) query.joinDate.$lte = new Date(filters.endDate);
    }
    
    const employees = await Employee.find(query)
      .populate('reportingManager', 'employeeCode firstName lastName')
      .limit(50000) // Max 50,000 records
      .lean();
    
    if (employees.length === 0) {
      throw new Error('No employees found matching the criteria');
    }
    
    // Get bank accounts and emergency contacts
    const employeeIds = employees.map(e => e._id);
    const bankAccounts = await EmployeeBankAccount.find({
      tenantId,
      employeeId: { $in: employeeIds },
      isPrimary: true,
    }).lean();
    
    const emergencyContacts = await EmployeeEmergencyContact.find({
      tenantId,
      employeeId: { $in: employeeIds },
      isPrimary: true,
    }).lean();
    
    const bankAccountMap = new Map(bankAccounts.map(ba => [ba.employeeId.toString(), ba]));
    const emergencyContactMap = new Map(emergencyContacts.map(ec => [ec.employeeId.toString(), ec]));
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Employees');
    
    // Define columns based on export type
    let columns = [];
    
    if (exportType === 'complete') {
      columns = [
        { header: 'Employee Code', key: 'employeeCode', width: 15 },
        { header: 'First Name', key: 'firstName', width: 15 },
        { header: 'Middle Name', key: 'middleName', width: 15 },
        { header: 'Last Name', key: 'lastName', width: 15 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Date of Birth', key: 'dateOfBirth', width: 15 },
        { header: 'Gender', key: 'gender', width: 10 },
        { header: 'Joining Date', key: 'joinDate', width: 15 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Designation', key: 'designation', width: 20 },
        { header: 'Grade', key: 'grade', width: 10 },
        { header: 'Reporting Manager', key: 'reportingManager', width: 25 },
        { header: 'Salary', key: 'salary', width: 15 },
        { header: 'CTC', key: 'ctc', width: 15 },
        { header: 'PAN', key: 'panNumber', width: 15 },
        { header: 'Aadhaar', key: 'aadhaarNumber', width: 15 },
        { header: 'UAN', key: 'uanNumber', width: 15 },
        { header: 'Bank Name', key: 'bankName', width: 20 },
        { header: 'Account Number', key: 'accountNumber', width: 20 },
        { header: 'IFSC Code', key: 'ifscCode', width: 15 },
        { header: 'Blood Group', key: 'bloodGroup', width: 12 },
        { header: 'Marital Status', key: 'maritalStatus', width: 15 },
        { header: 'Emergency Contact', key: 'emergencyContact', width: 25 },
        { header: 'Emergency Phone', key: 'emergencyPhone', width: 15 },
        { header: 'Address', key: 'address', width: 30 },
        { header: 'Location', key: 'location', width: 15 },
        { header: 'Status', key: 'status', width: 12 },
      ];
    } else if (exportType === 'basic') {
      columns = [
        { header: 'Employee Code', key: 'employeeCode', width: 15 },
        { header: 'First Name', key: 'firstName', width: 15 },
        { header: 'Last Name', key: 'lastName', width: 15 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Designation', key: 'designation', width: 20 },
        { header: 'Location', key: 'location', width: 15 },
        { header: 'Status', key: 'status', width: 12 },
      ];
    } else if (exportType === 'statutory') {
      columns = [
        { header: 'Employee Code', key: 'employeeCode', width: 15 },
        { header: 'First Name', key: 'firstName', width: 15 },
        { header: 'Last Name', key: 'lastName', width: 15 },
        { header: 'PAN', key: 'panNumber', width: 15 },
        { header: 'Aadhaar', key: 'aadhaarNumber', width: 15 },
        { header: 'UAN', key: 'uanNumber', width: 15 },
        { header: 'Bank Name', key: 'bankName', width: 20 },
        { header: 'Account Number', key: 'accountNumber', width: 20 },
        { header: 'IFSC Code', key: 'ifscCode', width: 15 },
      ];
    } else if (exportType === 'payroll') {
      columns = [
        { header: 'Employee Code', key: 'employeeCode', width: 15 },
        { header: 'First Name', key: 'firstName', width: 15 },
        { header: 'Last Name', key: 'lastName', width: 15 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Designation', key: 'designation', width: 20 },
        { header: 'Salary', key: 'salary', width: 15 },
        { header: 'CTC', key: 'ctc', width: 15 },
        { header: 'Bank Name', key: 'bankName', width: 20 },
        { header: 'Account Number', key: 'accountNumber', width: 20 },
        { header: 'IFSC Code', key: 'ifscCode', width: 15 },
        { header: 'UAN', key: 'uanNumber', width: 15 },
      ];
    }
    
    worksheet.columns = columns;
    
    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Add data rows
    employees.forEach(emp => {
      const bankAccount = bankAccountMap.get(emp._id.toString());
      const emergencyContact = emergencyContactMap.get(emp._id.toString());
      
      const rowData = {
        employeeCode: emp.employeeCode,
        firstName: emp.firstName,
        middleName: emp.middleName || '',
        lastName: emp.lastName,
        email: emp.email,
        phone: emp.phone,
        dateOfBirth: emp.dateOfBirth ? this.formatDate(emp.dateOfBirth) : '',
        gender: emp.gender,
        joinDate: emp.joinDate ? this.formatDate(emp.joinDate) : '',
        department: emp.department,
        designation: emp.designation,
        grade: emp.grade || '',
        reportingManager: emp.reportingManager
          ? `${emp.reportingManager.firstName} ${emp.reportingManager.lastName} (${emp.reportingManager.employeeCode})`
          : '',
        salary: emp.salary,
        ctc: emp.ctc,
        panNumber: emp.panNumber || '',
        aadhaarNumber: emp.aadhaarNumber || '',
        uanNumber: emp.uanNumber || '',
        bankName: bankAccount?.bankName || '',
        accountNumber: bankAccount?.accountNumber || '',
        ifscCode: bankAccount?.ifscCode || '',
        bloodGroup: emp.bloodGroup || '',
        maritalStatus: emp.maritalStatus || '',
        emergencyContact: emergencyContact?.name || '',
        emergencyPhone: emergencyContact?.phone || '',
        address: emp.address || '',
        location: emp.location,
        status: emp.status,
      };
      
      worksheet.addRow(rowData);
    });
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  /**
   * Format date to DD-MM-YYYY
   */
  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }
}

module.exports = new BulkEmployeeService();
