const EmployeeTransfer = require('../models/EmployeeTransfer');
const Employee = require('../models/Employee');
const OrganizationUnit = require('../models/OrganizationUnit');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * @desc    Create employee transfer request
 * @route   POST /api/transfers
 * @access  Private (Tenant Admin, HR Administrator)
 */
exports.createTransfer = asyncHandler(async (req, res) => {
  const {
    employeeId,
    toUnitId,
    transferType,
    effectiveDate,
    reason,
    remarks,
    isTemporary,
    temporaryEndDate,
  } = req.body;

  // Validate required fields
  if (!employeeId || !toUnitId || !effectiveDate) {
    return res.status(400).json({
      success: false,
      message: 'Employee ID, destination unit, and effective date are required',
    });
  }

  // Get employee
  const employee = await Employee.findOne({
    _id: employeeId,
    tenantId: req.tenantId,
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  // Get destination unit
  const toUnit = await OrganizationUnit.findOne({
    _id: toUnitId,
    tenantId: req.tenantId,
  });

  if (!toUnit) {
    return res.status(404).json({
      success: false,
      message: 'Destination organization unit not found',
    });
  }

  // Get current posting unit
  const fromUnitId = employee.postingUnitId;
  if (!fromUnitId) {
    return res.status(400).json({
      success: false,
      message: 'Employee does not have a current posting unit',
    });
  }

  // BR-ORG-04: Cannot transfer to same unit
  if (fromUnitId.toString() === toUnitId) {
    return res.status(400).json({
      success: false,
      message: 'Cannot transfer employee to the same unit',
    });
  }

  // Create transfer record
  const transfer = await EmployeeTransfer.create({
    tenantId: req.tenantId,
    employeeId,
    fromUnitId,
    toUnitId,
    transferType: transferType || 'Permanent',
    effectiveDate: new Date(effectiveDate),
    reason,
    remarks,
    isTemporary: isTemporary || false,
    temporaryEndDate: temporaryEndDate ? new Date(temporaryEndDate) : null,
    status: 'Pending',
    initiatedBy: req.user._id,
  });

  // Populate references
  await transfer.populate('employeeId', 'firstName lastName employeeCode');
  await transfer.populate('fromUnitId', 'unitCode unitName unitType');
  await transfer.populate('toUnitId', 'unitCode unitName unitType');

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || 'System',
    userEmail: req.user.email,
    action: 'Create',
    module: 'Organization',
    entityType: 'EmployeeTransfer',
    entityId: transfer._id,
    details: `Transfer request created: ${employee.firstName} ${employee.lastName} from ${transfer.fromUnitId.unitCode} to ${transfer.toUnitId.unitCode}`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    message: 'Transfer request created successfully',
    data: transfer,
  });
});

/**
 * @desc    Approve transfer request
 * @route   POST /api/transfers/:id/approve
 * @access  Private (Tenant Admin, HR Administrator)
 */
exports.approveTransfer = asyncHandler(async (req, res) => {
  const transfer = await EmployeeTransfer.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  }).populate('employeeId').populate('toUnitId');

  if (!transfer) {
    return res.status(404).json({
      success: false,
      message: 'Transfer request not found',
    });
  }

  if (transfer.status !== 'Pending') {
    return res.status(400).json({
      success: false,
      message: `Transfer request is already ${transfer.status}`,
    });
  }

  // Update transfer status
  transfer.status = 'Approved';
  transfer.approvedBy = req.user._id;
  transfer.approvedAt = new Date();
  await transfer.save();

  // BR-ORG-02: Update employee posting unit with effective date
  const employee = await Employee.findById(transfer.employeeId._id);
  if (employee) {
    // Record transfer in employee history
    if (!employee.transferHistory) {
      employee.transferHistory = [];
    }
    employee.transferHistory.push({
      fromUnitId: employee.postingUnitId,
      toUnitId: transfer.toUnitId._id,
      effectiveDate: transfer.effectiveDate,
      transferId: transfer._id,
      transferType: transfer.transferType,
    });

    // Update posting unit
    employee.postingUnitId = transfer.toUnitId._id;
    
    // BR-ORG-05: Update location if location is linked to branch
    if (transfer.toUnitId.unitType === 'BRANCH') {
      // Auto-update location from branch
      const Location = require('../models/Location');
      const branchLocation = await Location.findOne({
        tenantId: req.tenantId,
        branchId: transfer.toUnitId._id,
        status: 'Active',
      });
      if (branchLocation) {
        // Record location change
        if (!employee.locationHistory) {
          employee.locationHistory = [];
        }
        employee.locationHistory.push({
          locationId: branchLocation._id,
          locationName: branchLocation.name,
          effectiveDate: transfer.effectiveDate,
          reason: `Automatic location update due to branch transfer`,
          changedBy: req.user._id,
          changedAt: new Date(),
        });
        employee.location = branchLocation._id;
      }
    }
    
    await employee.save();
  }

  // Update transfer status to Completed
  transfer.status = 'Completed';
  await transfer.save();

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || 'System',
    userEmail: req.user.email,
    action: 'Approve',
    module: 'Organization',
    entityType: 'EmployeeTransfer',
    entityId: transfer._id,
    details: `Transfer approved and completed: ${employee.firstName} ${employee.lastName} transferred to ${transfer.toUnitId.unitCode}`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'Transfer approved and completed successfully',
    data: transfer,
  });
});

/**
 * @desc    Reject transfer request
 * @route   POST /api/transfers/:id/reject
 * @access  Private (Tenant Admin, HR Administrator)
 */
exports.rejectTransfer = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;

  if (!rejectionReason || rejectionReason.trim().length < 10) {
    return res.status(400).json({
      success: false,
      message: 'Rejection reason is required (minimum 10 characters)',
    });
  }

  const transfer = await EmployeeTransfer.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  }).populate('employeeId').populate('toUnitId');

  if (!transfer) {
    return res.status(404).json({
      success: false,
      message: 'Transfer request not found',
    });
  }

  if (transfer.status !== 'Pending') {
    return res.status(400).json({
      success: false,
      message: `Transfer request is already ${transfer.status}`,
    });
  }

  transfer.status = 'Rejected';
  transfer.rejectionReason = rejectionReason;
  await transfer.save();

  // Create audit log
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    userName: req.user.name || 'System',
    userEmail: req.user.email,
    action: 'Reject',
    module: 'Organization',
    entityType: 'EmployeeTransfer',
    entityId: transfer._id,
    details: `Transfer rejected: ${transfer.employeeId.firstName} ${transfer.employeeId.lastName}. Reason: ${rejectionReason}`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    status: 'Success',
  });

  res.status(200).json({
    success: true,
    message: 'Transfer rejected successfully',
    data: transfer,
  });
});

/**
 * @desc    Get all transfer requests
 * @route   GET /api/transfers
 * @access  Private
 */
exports.getTransfers = asyncHandler(async (req, res) => {
  const { status, employeeId, fromUnitId, toUnitId, transferType } = req.query;
  
  const filter = { tenantId: req.tenantId };
  
  if (status) filter.status = status;
  if (employeeId) filter.employeeId = employeeId;
  if (fromUnitId) filter.fromUnitId = fromUnitId;
  if (toUnitId) filter.toUnitId = toUnitId;
  if (transferType) filter.transferType = transferType;

  const transfers = await EmployeeTransfer.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode email')
    .populate('fromUnitId', 'unitCode unitName unitType')
    .populate('toUnitId', 'unitCode unitName unitType')
    .populate('initiatedBy', 'name email')
    .populate('approvedBy', 'name email')
    .sort({ effectiveDate: -1, createdAt: -1 })
    .limit(1000);

  res.status(200).json({
    success: true,
    count: transfers.length,
    data: transfers,
  });
});

/**
 * @desc    Get single transfer request
 * @route   GET /api/transfers/:id
 * @access  Private
 */
exports.getTransfer = asyncHandler(async (req, res) => {
  const transfer = await EmployeeTransfer.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('employeeId', 'firstName lastName employeeCode email phone designation department')
    .populate('fromUnitId', 'unitCode unitName unitType state city')
    .populate('toUnitId', 'unitCode unitName unitType state city')
    .populate('initiatedBy', 'name email role')
    .populate('approvedBy', 'name email role');

  if (!transfer) {
    return res.status(404).json({
      success: false,
      message: 'Transfer request not found',
    });
  }

  res.status(200).json({
    success: true,
    data: transfer,
  });
});

/**
 * @desc    Get employee transfer history
 * @route   GET /api/transfers/employee/:employeeId
 * @access  Private
 */
exports.getEmployeeTransferHistory = asyncHandler(async (req, res) => {
  const transfers = await EmployeeTransfer.find({
    tenantId: req.tenantId,
    employeeId: req.params.employeeId,
  })
    .populate('fromUnitId', 'unitCode unitName unitType')
    .populate('toUnitId', 'unitCode unitName unitType')
    .populate('approvedBy', 'name email')
    .sort({ effectiveDate: -1 });

  res.status(200).json({
    success: true,
    count: transfers.length,
    data: transfers,
  });
});
