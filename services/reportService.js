const Employee = require('../models/Employee');
const Payroll = require('../models/Payroll');
const LeaveRequest = require('../models/LeaveRequest');
const Attendance = require('../models/Attendance');
const Expense = require('../models/Expense');
const Grievance = require('../models/Grievance');
const Appraisal = require('../models/Appraisal');
const TransferRequest = require('../models/TransferRequest');
const EmployeeLoan = require('../models/EmployeeLoan');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');

/**
 * Report Service
 * BRD: BR-P1-006 - Reports & Analytics Enhancement
 */
class ReportService {
  /**
   * Generate standard report
   */
  async generateStandardReport(tenantId, reportType, filters = {}) {
    let data = [];
    let columns = [];

    switch (reportType) {
      case 'EMPLOYEE_MASTER':
        data = await this.getEmployeeMasterReport(tenantId, filters);
        columns = [
          { field: 'employeeCode', label: 'Employee Code' },
          { field: 'name', label: 'Name' },
          { field: 'email', label: 'Email' },
          { field: 'phone', label: 'Phone' },
          { field: 'department', label: 'Department' },
          { field: 'designation', label: 'Designation' },
          { field: 'location', label: 'Location' },
          { field: 'joinDate', label: 'Joining Date' },
          { field: 'status', label: 'Status' },
        ];
        break;

      case 'PAYROLL_SUMMARY':
        data = await this.getPayrollSummaryReport(tenantId, filters);
        columns = [
          { field: 'employeeCode', label: 'Employee Code' },
          { field: 'name', label: 'Name' },
          { field: 'department', label: 'Department' },
          { field: 'basicSalary', label: 'Basic Salary' },
          { field: 'grossSalary', label: 'Gross Salary' },
          { field: 'deductions', label: 'Total Deductions' },
          { field: 'netSalary', label: 'Net Salary' },
        ];
        break;

      case 'ATTENDANCE_SUMMARY':
        data = await this.getAttendanceSummaryReport(tenantId, filters);
        columns = [
          { field: 'employeeCode', label: 'Employee Code' },
          { field: 'name', label: 'Name' },
          { field: 'presentDays', label: 'Present Days' },
          { field: 'absentDays', label: 'Absent Days' },
          { field: 'leaveDays', label: 'Leave Days' },
          { field: 'overtimeHours', label: 'OT Hours' },
        ];
        break;

      case 'LEAVE_BALANCE':
        data = await this.getLeaveBalanceReport(tenantId, filters);
        columns = [
          { field: 'employeeCode', label: 'Employee Code' },
          { field: 'name', label: 'Name' },
          { field: 'leaveType', label: 'Leave Type' },
          { field: 'entitled', label: 'Entitled' },
          { field: 'availed', label: 'Availed' },
          { field: 'balance', label: 'Balance' },
        ];
        break;

      case 'PERFORMANCE_RATING':
        data = await this.getPerformanceRatingReport(tenantId, filters);
        columns = [
          { field: 'employeeCode', label: 'Employee Code' },
          { field: 'name', label: 'Name' },
          { field: 'cycleName', label: 'Appraisal Cycle' },
          { field: 'rating', label: 'Rating' },
          { field: 'increment', label: 'Increment %' },
        ];
        break;

      case 'GRIEVANCE_STATUS':
        data = await this.getGrievanceStatusReport(tenantId, filters);
        columns = [
          { field: 'grievanceId', label: 'Grievance ID' },
          { field: 'employeeCode', label: 'Employee Code' },
          { field: 'category', label: 'Category' },
          { field: 'status', label: 'Status' },
          { field: 'severity', label: 'Severity' },
          { field: 'daysOpen', label: 'Days Open' },
        ];
        break;

      case 'TRANSFER_HISTORY':
        data = await this.getTransferHistoryReport(tenantId, filters);
        columns = [
          { field: 'transferId', label: 'Transfer ID' },
          { field: 'employeeCode', label: 'Employee Code' },
          { field: 'fromLocation', label: 'From' },
          { field: 'toLocation', label: 'To' },
          { field: 'transferDate', label: 'Transfer Date' },
          { field: 'status', label: 'Status' },
        ];
        break;

      case 'LOAN_SUMMARY':
        data = await this.getLoanSummaryReport(tenantId, filters);
        columns = [
          { field: 'employeeCode', label: 'Employee Code' },
          { field: 'name', label: 'Name' },
          { field: 'loanType', label: 'Loan Type' },
          { field: 'loanAmount', label: 'Loan Amount' },
          { field: 'outstanding', label: 'Outstanding' },
          { field: 'emiAmount', label: 'EMI' },
        ];
        break;

      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }

    return { data, columns };
  }

  /**
   * Generate custom report from template
   */
  async generateCustomReport(tenantId, template, filters = {}) {
    const query = this.buildQuery(template.dataSource, tenantId, filters, template.filters);
    const data = await this.executeQuery(template.dataSource, query);
    
    // Apply grouping and sorting
    let processedData = data;
    if (template.grouping && template.grouping.length > 0) {
      processedData = this.applyGrouping(processedData, template.grouping);
    }
    if (template.sorting && template.sorting.length > 0) {
      processedData = this.applySorting(processedData, template.sorting);
    }

    // Select visible columns
    const visibleColumns = template.columns.filter(c => c.visible !== false);

    return { data: processedData, columns: visibleColumns };
  }

  /**
   * Build query from filters
   */
  buildQuery(dataSource, tenantId, userFilters, templateFilters) {
    const query = { tenantId: new mongoose.Types.ObjectId(tenantId) };

    // Apply template filters
    if (templateFilters) {
      templateFilters.forEach(filter => {
        if (userFilters[filter.field] !== undefined) {
          const value = userFilters[filter.field];
          switch (filter.operator) {
            case 'EQUALS':
              query[filter.field] = value;
              break;
            case 'NOT_EQUALS':
              query[filter.field] = { $ne: value };
              break;
            case 'CONTAINS':
              query[filter.field] = { $regex: value, $options: 'i' };
              break;
            case 'GREATER_THAN':
              query[filter.field] = { $gt: value };
              break;
            case 'LESS_THAN':
              query[filter.field] = { $lt: value };
              break;
            case 'BETWEEN':
              query[filter.field] = { $gte: value[0], $lte: value[1] };
              break;
            case 'IN':
              query[filter.field] = { $in: Array.isArray(value) ? value : [value] };
              break;
          }
        } else if (filter.defaultValue !== undefined && filter.required) {
          query[filter.field] = filter.defaultValue;
        }
      });
    }

    return query;
  }

  /**
   * Execute query based on data source
   */
  async executeQuery(dataSource, query) {
    let Model;
    switch (dataSource) {
      case 'Employee':
        Model = Employee;
        break;
      case 'Payroll':
        Model = Payroll;
        break;
      case 'LeaveRequest':
        Model = LeaveRequest;
        break;
      case 'Attendance':
        Model = Attendance;
        break;
      case 'Expense':
        Model = Expense;
        break;
      case 'Grievance':
        Model = Grievance;
        break;
      case 'Appraisal':
        Model = Appraisal;
        break;
      case 'TransferRequest':
        Model = TransferRequest;
        break;
      case 'EmployeeLoan':
        Model = EmployeeLoan;
        break;
      default:
        throw new Error(`Unknown data source: ${dataSource}`);
    }

    return await Model.find(query).lean();
  }

  /**
   * Apply grouping
   */
  applyGrouping(data, grouping) {
    // Simple grouping implementation
    // For complex grouping, use MongoDB aggregation
    const grouped = {};
    data.forEach(item => {
      const key = grouping.map(g => item[g.field]).join('|');
      if (!grouped[key]) {
        grouped[key] = { ...item, _count: 0 };
      }
      grouped[key]._count++;
    });
    return Object.values(grouped);
  }

  /**
   * Apply sorting
   */
  applySorting(data, sorting) {
    return data.sort((a, b) => {
      for (const sort of sorting) {
        const aVal = a[sort.field];
        const bVal = b[sort.field];
        if (aVal < bVal) return sort.direction === 'ASC' ? -1 : 1;
        if (aVal > bVal) return sort.direction === 'ASC' ? 1 : -1;
      }
      return 0;
    });
  }

  /**
   * Export report to Excel
   */
  async exportToExcel(data, columns, filename = 'report') {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Add headers
    const headers = columns.map(c => c.label || c.field);
    worksheet.addRow(headers);

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };

    // Add data rows
    data.forEach(row => {
      const values = columns.map(col => {
        const value = this.getNestedValue(row, col.field);
        return this.formatValue(value, col.format);
      });
      worksheet.addRow(values);
    });

    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      column.width = Math.max(headers[index].length + 5, 15);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  /**
   * Get nested value from object
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((o, p) => o && o[p], obj);
  }

  /**
   * Format value based on format type
   */
  formatValue(value, format) {
    if (value === null || value === undefined) return '';
    if (format === 'DATE' && value instanceof Date) {
      return value.toLocaleDateString('en-IN');
    }
    if (format === 'CURRENCY' && typeof value === 'number') {
      return `₹${value.toLocaleString('en-IN')}`;
    }
    return value;
  }

  // Standard report generators
  async getEmployeeMasterReport(tenantId, filters) {
    const query = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (filters.department) query.department = filters.department;
    if (filters.status) query.status = filters.status;
    if (filters.location) query.location = filters.location;

    const employees = await Employee.find(query)
      .select('employeeCode firstName lastName email phone department designation location joinDate status')
      .lean();

    return employees.map(emp => ({
      employeeCode: emp.employeeCode,
      name: `${emp.firstName} ${emp.lastName}`,
      email: emp.email,
      phone: emp.phone,
      department: emp.department,
      designation: emp.designation,
      location: emp.location,
      joinDate: emp.joinDate,
      status: emp.status,
    }));
  }

  async getPayrollSummaryReport(tenantId, filters) {
    const query = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (filters.month) query.month = filters.month;
    if (filters.year) query.year = filters.year;

    const payrolls = await Payroll.find(query)
      .populate('employeeId', 'employeeCode firstName lastName department')
      .lean();

    return payrolls.map(p => ({
      employeeCode: p.employeeId?.employeeCode,
      name: `${p.employeeId?.firstName} ${p.employeeId?.lastName}`,
      department: p.employeeId?.department,
      basicSalary: p.basicSalary,
      grossSalary: p.grossSalary,
      deductions: (p.pfDeduction || 0) + (p.esiDeduction || 0) + (p.incomeTax || 0),
      netSalary: p.netSalary,
    }));
  }

  async getAttendanceSummaryReport(tenantId, filters) {
    const startDate = filters.startDate ? new Date(filters.startDate) : new Date();
    startDate.setDate(1);
    const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

    const query = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      date: { $gte: startDate, $lte: endDate },
    };
    if (filters.employeeId) query.employeeId = filters.employeeId;

    const attendances = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$employeeId',
          presentDays: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
          absentDays: { $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] } },
          leaveDays: { $sum: { $cond: [{ $eq: ['$status', 'On Leave'] }, 1, 0] } },
          overtimeHours: { $sum: { $ifNull: ['$overtimeHours', 0] } },
        },
      },
    ]);

    const employeeIds = attendances.map(a => a._id);
    const employees = await Employee.find({ _id: { $in: employeeIds } })
      .select('employeeCode firstName lastName')
      .lean();

    const employeeMap = new Map(employees.map(e => [e._id.toString(), e]));

    return attendances.map(a => ({
      employeeCode: employeeMap.get(a._id.toString())?.employeeCode,
      name: `${employeeMap.get(a._id.toString())?.firstName} ${employeeMap.get(a._id.toString())?.lastName}`,
      presentDays: a.presentDays,
      absentDays: a.absentDays,
      leaveDays: a.leaveDays,
      overtimeHours: a.overtimeHours,
    }));
  }

  async getLeaveBalanceReport(tenantId, filters) {
    // This would need integration with leave balance calculation
    // For now, return placeholder structure
    return [];
  }

  async getPerformanceRatingReport(tenantId, filters) {
    const query = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (filters.cycleId) query.cycleId = filters.cycleId;

    const appraisals = await Appraisal.find(query)
      .populate('employeeId', 'employeeCode firstName lastName')
      .populate('cycleId', 'cycleName')
      .lean();

    return appraisals.map(a => ({
      employeeCode: a.employeeId?.employeeCode,
      name: `${a.employeeId?.firstName} ${a.employeeId?.lastName}`,
      cycleName: a.cycleId?.cycleName,
      rating: a.finalRating || a.managerReview?.overallPerformanceRating,
      increment: a.increment?.percentage,
    }));
  }

  async getGrievanceStatusReport(tenantId, filters) {
    const query = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;

    const grievances = await Grievance.find(query)
      .populate('employeeId', 'employeeCode')
      .lean();

    return grievances.map(g => ({
      grievanceId: g.grievanceId,
      employeeCode: g.employeeId?.employeeCode,
      category: g.category,
      status: g.status,
      severity: g.severity,
      daysOpen: g.submittedDate ? Math.floor((new Date() - new Date(g.submittedDate)) / (1000 * 60 * 60 * 24)) : 0,
    }));
  }

  async getTransferHistoryReport(tenantId, filters) {
    const query = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (filters.status) query.status = filters.status;
    if (filters.transferType) query.transferType = filters.transferType;

    const transfers = await TransferRequest.find(query)
      .populate('employeeId', 'employeeCode')
      .lean();

    return transfers.map(t => ({
      transferId: t.transferId,
      employeeCode: t.employeeId?.employeeCode,
      fromLocation: t.currentLocation?.location,
      toLocation: t.approvedLocation?.location || t.requestedLocation?.location,
      transferDate: t.actualJoiningDate || t.approvedJoiningDate,
      status: t.status,
    }));
  }

  async getLoanSummaryReport(tenantId, filters) {
    const query = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (filters.loanType) query.loanTypeId = filters.loanType;

    const loans = await EmployeeLoan.find(query)
      .populate('employeeId', 'employeeCode firstName lastName')
      .populate('loanTypeId', 'loanTypeName')
      .lean();

    return loans.map(l => ({
      employeeCode: l.employeeId?.employeeCode,
      name: `${l.employeeId?.firstName} ${l.employeeId?.lastName}`,
      loanType: l.loanTypeId?.loanTypeName,
      loanAmount: l.loanAmount,
      outstanding: l.outstandingAmount,
      emiAmount: l.emiAmount,
    }));
  }
}

module.exports = new ReportService();
