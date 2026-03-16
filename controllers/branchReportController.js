const OrganizationUnit = require('../models/OrganizationUnit');
const Employee = require('../models/Employee');
const PromotionRecord = require('../models/PromotionRecord');
const EmployeeTransfer = require('../models/EmployeeTransfer');
const Position = require('../models/Position');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * @desc    Get comprehensive branch-wise report
 * @route   GET /api/reports/branch/:branchId
 * @access  Private
 */
exports.getBranchReport = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { fromDate, toDate } = req.query;

  const branch = await OrganizationUnit.findOne({
    _id: branchId,
    tenantId: req.tenantId,
    unitType: 'BRANCH',
  });

  if (!branch) {
    return res.status(404).json({
      success: false,
      message: 'Branch not found',
    });
  }

  const dateFilter = {};
  if (fromDate || toDate) {
    dateFilter.createdAt = {};
    if (fromDate) dateFilter.createdAt.$gte = new Date(fromDate);
    if (toDate) dateFilter.createdAt.$lte = new Date(toDate);
  }

  // Get all employees in this branch
  const employees = await Employee.find({
    tenantId: req.tenantId,
    postingUnitId: branchId,
    status: 'Active',
  })
    .populate('designation', 'name')
    .populate('grade', 'name')
    .populate('location', 'name city state');

  // Department-wise breakdown
  const departmentBreakdown = {};
  employees.forEach((emp) => {
    const dept = emp.department || 'Unassigned';
    if (!departmentBreakdown[dept]) {
      departmentBreakdown[dept] = { count: 0, employees: [] };
    }
    departmentBreakdown[dept].count++;
    departmentBreakdown[dept].employees.push({
      id: emp._id,
      name: `${emp.firstName} ${emp.lastName}`,
      employeeCode: emp.employeeCode,
      designation: typeof emp.designation === 'object' ? emp.designation.name : emp.designation,
    });
  });

  // Grade-wise breakdown
  const gradeBreakdown = {};
  employees.forEach((emp) => {
    const grade = typeof emp.grade === 'object' ? emp.grade?.name : emp.grade || 'Unassigned';
    gradeBreakdown[grade] = (gradeBreakdown[grade] || 0) + 1;
  });

  // Designation-wise breakdown
  const designationBreakdown = {};
  employees.forEach((emp) => {
    const desig = typeof emp.designation === 'object' ? emp.designation?.name : emp.designation || 'Unassigned';
    designationBreakdown[desig] = (designationBreakdown[desig] || 0) + 1;
  });

  // Get promotions in date range
  const promotionFilter = {
    tenantId: req.tenantId,
    $or: [
      { previousPostingUnitId: branchId },
      { newPostingUnitId: branchId },
    ],
  };
  if (fromDate || toDate) {
    promotionFilter.effectiveDate = {};
    if (fromDate) promotionFilter.effectiveDate.$gte = new Date(fromDate);
    if (toDate) promotionFilter.effectiveDate.$lte = new Date(toDate);
  }

  const promotions = await PromotionRecord.find(promotionFilter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('previousPostingUnitId', 'unitCode unitName')
    .populate('newPostingUnitId', 'unitCode unitName')
    .sort({ effectiveDate: -1 });

  // Promotion trends (monthly)
  const promotionTrends = {};
  promotions.forEach((promo) => {
    const month = new Date(promo.effectiveDate).toISOString().slice(0, 7); // YYYY-MM
    if (!promotionTrends[month]) {
      promotionTrends[month] = { count: 0, promotions: [] };
    }
    promotionTrends[month].count++;
    promotionTrends[month].promotions.push({
      employee: `${promo.employeeId?.firstName} ${promo.employeeId?.lastName}`,
      from: promo.previousDesignation,
      to: promo.newDesignation,
      date: promo.effectiveDate,
      includesTransfer: promo.includesTransfer,
    });
  });

  // Get transfers
  const transferFilter = {
    tenantId: req.tenantId,
    $or: [
      { fromUnitId: branchId },
      { toUnitId: branchId },
    ],
  };
  if (fromDate || toDate) {
    transferFilter.effectiveDate = {};
    if (fromDate) transferFilter.effectiveDate.$gte = new Date(fromDate);
    if (toDate) transferFilter.effectiveDate.$lte = new Date(toDate);
  }

  const transfers = await EmployeeTransfer.find(transferFilter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('fromUnitId', 'unitCode unitName')
    .populate('toUnitId', 'unitCode unitName')
    .sort({ effectiveDate: -1 });

  // Transfer trends
  const transferTrends = {};
  transfers.forEach((transfer) => {
    const month = new Date(transfer.effectiveDate).toISOString().slice(0, 7);
    if (!transferTrends[month]) {
      transferTrends[month] = { incoming: 0, outgoing: 0, transfers: [] };
    }
    if (transfer.toUnitId?._id?.toString() === branchId) {
      transferTrends[month].incoming++;
    }
    if (transfer.fromUnitId?._id?.toString() === branchId) {
      transferTrends[month].outgoing++;
    }
    transferTrends[month].transfers.push({
      employee: `${transfer.employeeId?.firstName} ${transfer.employeeId?.lastName}`,
      from: transfer.fromUnitId?.unitCode || 'N/A',
      to: transfer.toUnitId?.unitCode || 'N/A',
      type: transfer.transferType,
      date: transfer.effectiveDate,
    });
  });

  // Get positions
  const positions = await Position.find({
    tenantId: req.tenantId,
    postingUnitId: branchId,
  })
    .populate('designation', 'name')
    .populate('currentEmployeeId', 'firstName lastName employeeCode');

  const positionSummary = {
    total: positions.length,
    vacant: positions.filter((p) => p.status === 'Vacant').length,
    filled: positions.filter((p) => p.status === 'Filled').length,
    onHold: positions.filter((p) => p.status === 'On Hold').length,
  };

  // Age distribution
  const ageGroups = {
    '20-30': 0,
    '31-40': 0,
    '41-50': 0,
    '51-60': 0,
    '60+': 0,
  };

  employees.forEach((emp) => {
    if (emp.dateOfBirth) {
      const age = new Date().getFullYear() - new Date(emp.dateOfBirth).getFullYear();
      if (age >= 20 && age <= 30) ageGroups['20-30']++;
      else if (age >= 31 && age <= 40) ageGroups['31-40']++;
      else if (age >= 41 && age <= 50) ageGroups['41-50']++;
      else if (age >= 51 && age <= 60) ageGroups['51-60']++;
      else if (age > 60) ageGroups['60+']++;
    }
  });

  // Experience distribution
  const experienceGroups = {
    '0-2': 0,
    '3-5': 0,
    '6-10': 0,
    '11-15': 0,
    '15+': 0,
  };

  employees.forEach((emp) => {
    if (emp.joinDate) {
      const experience = new Date().getFullYear() - new Date(emp.joinDate).getFullYear();
      if (experience >= 0 && experience <= 2) experienceGroups['0-2']++;
      else if (experience >= 3 && experience <= 5) experienceGroups['3-5']++;
      else if (experience >= 6 && experience <= 10) experienceGroups['6-10']++;
      else if (experience >= 11 && experience <= 15) experienceGroups['11-15']++;
      else if (experience > 15) experienceGroups['15+']++;
    }
  });

  res.status(200).json({
    success: true,
    data: {
      branch: {
        id: branch._id,
        code: branch.unitCode,
        name: branch.unitName,
        city: branch.city,
        state: branch.state,
        ifsc: branch.ifsc,
      },
      summary: {
        totalEmployees: employees.length,
        male: employees.filter((e) => e.gender === 'Male').length,
        female: employees.filter((e) => e.gender === 'Female').length,
        permanent: employees.filter((e) => e.employmentType === 'Permanent').length,
        contract: employees.filter((e) => e.employmentType === 'Contract').length,
      },
      departmentBreakdown: Object.entries(departmentBreakdown).map(([dept, data]) => ({
        department: dept,
        count: data.count,
        employees: data.employees,
      })),
      gradeBreakdown: Object.entries(gradeBreakdown).map(([grade, count]) => ({
        grade,
        count,
      })),
      designationBreakdown: Object.entries(designationBreakdown).map(([designation, count]) => ({
        designation,
        count,
      })),
      ageDistribution: Object.entries(ageGroups).map(([range, count]) => ({
        range,
        count,
      })),
      experienceDistribution: Object.entries(experienceGroups).map(([range, count]) => ({
        range,
        count,
      })),
      promotions: {
        total: promotions.length,
        recent: promotions.slice(0, 10),
        trends: Object.entries(promotionTrends).map(([month, data]) => ({
          month,
          count: data.count,
          promotions: data.promotions,
        })),
      },
      transfers: {
        total: transfers.length,
        incoming: transfers.filter((t) => t.toUnitId?._id?.toString() === branchId).length,
        outgoing: transfers.filter((t) => t.fromUnitId?._id?.toString() === branchId).length,
        recent: transfers.slice(0, 10),
        trends: Object.entries(transferTrends).map(([month, data]) => ({
          month,
          incoming: data.incoming,
          outgoing: data.outgoing,
          transfers: data.transfers,
        })),
      },
      positions: positionSummary,
      dateRange: {
        from: fromDate || null,
        to: toDate || null,
      },
    },
  });
});

/**
 * @desc    Get comparison report across multiple branches
 * @route   GET /api/reports/branch/compare
 * @access  Private
 */
exports.compareBranches = asyncHandler(async (req, res) => {
  const { branchIds, fromDate, toDate } = req.query;
  
  if (!branchIds || !Array.isArray(branchIds) || branchIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide branch IDs to compare',
    });
  }

  const comparisonData = await Promise.all(
    branchIds.map(async (branchId) => {
      const branch = await OrganizationUnit.findOne({
        _id: branchId,
        tenantId: req.tenantId,
        unitType: 'BRANCH',
      });

      if (!branch) return null;

      const employees = await Employee.countDocuments({
        tenantId: req.tenantId,
        postingUnitId: branchId,
        status: 'Active',
      });

      const promotionFilter = {
        tenantId: req.tenantId,
        $or: [
          { previousPostingUnitId: branchId },
          { newPostingUnitId: branchId },
        ],
      };
      if (fromDate || toDate) {
        promotionFilter.effectiveDate = {};
        if (fromDate) promotionFilter.effectiveDate.$gte = new Date(fromDate);
        if (toDate) promotionFilter.effectiveDate.$lte = new Date(toDate);
      }
      const promotions = await PromotionRecord.countDocuments(promotionFilter);

      const transferFilter = {
        tenantId: req.tenantId,
        $or: [
          { fromUnitId: branchId },
          { toUnitId: branchId },
        ],
      };
      if (fromDate || toDate) {
        transferFilter.effectiveDate = {};
        if (fromDate) transferFilter.effectiveDate.$gte = new Date(fromDate);
        if (toDate) transferFilter.effectiveDate.$lte = new Date(toDate);
      }
      const transfers = await EmployeeTransfer.countDocuments(transferFilter);

      const positions = await Position.find({
        tenantId: req.tenantId,
        postingUnitId: branchId,
      });
      const vacantPositions = positions.filter((p) => p.status === 'Vacant').length;

      return {
        branchId: branch._id,
        branchCode: branch.unitCode,
        branchName: branch.unitName,
        city: branch.city,
        state: branch.state,
        totalEmployees: employees,
        promotions,
        transfers,
        vacantPositions,
        filledPositions: positions.filter((p) => p.status === 'Filled').length,
      };
    })
  );

  res.status(200).json({
    success: true,
    data: comparisonData.filter((item) => item !== null),
  });
});

/**
 * @desc    Get all branches summary report
 * @route   GET /api/reports/branch/summary
 * @access  Private
 */
exports.getAllBranchesSummary = asyncHandler(async (req, res) => {
  const branches = await OrganizationUnit.find({
    tenantId: req.tenantId,
    unitType: 'BRANCH',
    isActive: true,
  }).sort({ unitCode: 1 });

  const summary = await Promise.all(
    branches.map(async (branch) => {
      const employees = await Employee.countDocuments({
        tenantId: req.tenantId,
        postingUnitId: branch._id,
        status: 'Active',
      });

      const positions = await Position.find({
        tenantId: req.tenantId,
        postingUnitId: branch._id,
      });

      return {
        branchId: branch._id,
        branchCode: branch.unitCode,
        branchName: branch.unitName,
        city: branch.city,
        state: branch.state,
        totalEmployees: employees,
        vacantPositions: positions.filter((p) => p.status === 'Vacant').length,
        filledPositions: positions.filter((p) => p.status === 'Filled').length,
        totalPositions: positions.length,
      };
    })
  );

  res.status(200).json({
    success: true,
    count: summary.length,
    data: summary,
  });
});
