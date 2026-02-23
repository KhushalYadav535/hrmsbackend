const TransferRequest = require('../models/TransferRequest');
const Employee = require('../models/Employee');
const OrganizationUnit = require('../models/OrganizationUnit');
const PostingHistory = require('../models/PostingHistory');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * Transfer Management Controller
 * BRD: BR-P2-003 - Transfer Management Complete Workflow
 */

// @desc    Submit transfer request
// @route   POST /api/transfers
// @access  Private (Employee, HR Administrator)
exports.submitTransferRequest = asyncHandler(async (req, res) => {
  const {
    transferType,
    requestedLocation,
    reason,
    requestedRelievingDate,
    requestedJoiningDate,
    supportingDocuments,
    mutualTransfer,
  } = req.body;

  const employee = await Employee.findOne({
    tenantId: req.tenantId,
    _id: req.user.employeeId,
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found',
    });
  }

  // Check eligibility (minimum 2 years tenure)
  const currentPosting = await PostingHistory.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
  }).sort({ effectiveDate: -1 });

  if (currentPosting) {
    const tenureMonths = (Date.now() - new Date(currentPosting.effectiveDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (tenureMonths < 24 && transferType !== 'COMPASSIONATE' && transferType !== 'HARDSHIP') {
      return res.status(400).json({
        success: false,
        message: `Minimum 2 years tenure required at current location. Current tenure: ${Math.floor(tenureMonths)} months`,
      });
    }
  }

  // Check for pending transfers
  const pendingTransfer = await TransferRequest.findOne({
    tenantId: req.tenantId,
    employeeId: employee._id,
    status: {
      $in: [
        'SUBMITTED',
        'CURRENT_MANAGER_PENDING',
        'CURRENT_MANAGER_APPROVED',
        'DESTINATION_MANAGER_PENDING',
        'HR_VERIFICATION_PENDING',
        'TRANSFER_ORDER_GENERATED',
      ],
    },
  });

  if (pendingTransfer) {
    return res.status(400).json({
      success: false,
      message: 'You already have a pending transfer request',
    });
  }

  // Get current location details
  const currentUnit = employee.postingUnitId
    ? await OrganizationUnit.findById(employee.postingUnitId)
    : null;

  const transferRequest = await TransferRequest.create({
    tenantId: req.tenantId,
    employeeId: employee._id,
    transferType,
    initiatedBy: 'EMPLOYEE',
    initiatedByUserId: req.user._id,
    currentLocation: {
      unitId: employee.postingUnitId,
      location: employee.location,
      department: employee.department,
      designation: employee.designation,
    },
    requestedLocation,
    reason,
    requestedRelievingDate: requestedRelievingDate ? new Date(requestedRelievingDate) : null,
    requestedJoiningDate: requestedJoiningDate ? new Date(requestedJoiningDate) : null,
    supportingDocuments: supportingDocuments || [],
    mutualTransfer: mutualTransfer || { isMutual: false },
    status: 'SUBMITTED',
    submittedDate: new Date(),
  });

  // Update status to route to current manager
  transferRequest.status = 'CURRENT_MANAGER_PENDING';
  await transferRequest.save();

  await transferRequest.populate('employeeId', 'firstName lastName employeeCode');

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Submit Transfer Request',
    module: 'Personnel',
    entityType: 'TransferRequest',
    entityId: transferRequest._id,
    details: `Transfer request submitted: ${transferRequest.transferId}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    data: transferRequest,
  });
});

// @desc    Get transfer requests
// @route   GET /api/transfers
// @access  Private
exports.getTransferRequests = asyncHandler(async (req, res) => {
  const { status, transferType, employeeId, page = 1, limit = 50 } = req.query;

  const query = { tenantId: req.tenantId };

  if (employeeId) {
    query.employeeId = employeeId;
  } else if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({
      tenantId: req.tenantId,
      _id: req.user.employeeId,
    });
    if (employee) {
      query.employeeId = employee._id;
    }
  }

  if (status) query.status = status;
  if (transferType) query.transferType = transferType;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const transfers = await TransferRequest.find(query)
    .populate('employeeId', 'firstName lastName employeeCode department designation')
    .populate('currentLocation.unitId', 'unitName unitType')
    .populate('requestedLocation.unitId', 'unitName unitType')
    .populate('approvedLocation.unitId', 'unitName unitType')
    .populate('approvedLocation.reportingManagerId', 'firstName lastName employeeCode')
    .sort({ submittedDate: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await TransferRequest.countDocuments(query);

  res.json({
    success: true,
    data: transfers,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// @desc    Approve/reject by current manager
// @route   PATCH /api/transfers/:id/current-manager-approval
// @access  Private (Manager, HR Administrator)
exports.currentManagerApproval = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, recommendation, rejectionReason } = req.body;

  const transfer = await TransferRequest.findById(id);
  if (!transfer || transfer.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Transfer request not found',
    });
  }

  if (transfer.status !== 'CURRENT_MANAGER_PENDING') {
    return res.status(400).json({
      success: false,
      message: `Transfer is not pending current manager approval. Current status: ${transfer.status}`,
    });
  }

  if (action === 'APPROVE') {
    transfer.currentManagerApproval = {
      status: 'APPROVED',
      approvedBy: req.user._id,
      approvedDate: new Date(),
      recommendation,
    };
    transfer.status = 'DESTINATION_MANAGER_PENDING';
  } else if (action === 'REJECT') {
    transfer.currentManagerApproval = {
      status: 'REJECTED',
      approvedBy: req.user._id,
      approvedDate: new Date(),
      rejectionReason,
    };
    transfer.status = 'REJECTED';
  }

  await transfer.save();

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: `Current Manager ${action} Transfer`,
    module: 'Personnel',
    entityType: 'TransferRequest',
    entityId: transfer._id,
    details: `${action} transfer request ${transfer.transferId}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.json({
    success: true,
    data: transfer,
  });
});

// @desc    Approve/reject by destination manager
// @route   PATCH /api/transfers/:id/destination-manager-approval
// @access  Private (Manager, HR Administrator)
exports.destinationManagerApproval = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, acceptance, rejectionReason } = req.body;

  const transfer = await TransferRequest.findById(id);
  if (!transfer || transfer.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Transfer request not found',
    });
  }

  if (transfer.status !== 'DESTINATION_MANAGER_PENDING') {
    return res.status(400).json({
      success: false,
      message: `Transfer is not pending destination manager approval. Current status: ${transfer.status}`,
    });
  }

  if (action === 'APPROVE') {
    transfer.destinationManagerApproval = {
      status: 'APPROVED',
      approvedBy: req.user._id,
      approvedDate: new Date(),
      acceptance,
    };
    transfer.status = 'HR_VERIFICATION_PENDING';
  } else if (action === 'REJECT') {
    transfer.destinationManagerApproval = {
      status: 'REJECTED',
      approvedBy: req.user._id,
      approvedDate: new Date(),
      rejectionReason,
    };
    transfer.status = 'REJECTED';
  }

  await transfer.save();

  res.json({
    success: true,
    data: transfer,
  });
});

// @desc    HR verification
// @route   PATCH /api/transfers/:id/hr-verification
// @access  Private (HR Administrator, Tenant Admin)
exports.hrVerification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { availabilityConfirmed, remarks, approvedLocation, approvedRelievingDate, approvedJoiningDate } = req.body;

  const transfer = await TransferRequest.findById(id);
  if (!transfer || transfer.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Transfer request not found',
    });
  }

  if (transfer.status !== 'HR_VERIFICATION_PENDING') {
    return res.status(400).json({
      success: false,
      message: `Transfer is not pending HR verification. Current status: ${transfer.status}`,
    });
  }

  transfer.hrVerification = {
    verifiedBy: req.user._id,
    verifiedDate: new Date(),
    availabilityConfirmed,
    remarks,
  };

  if (availabilityConfirmed) {
    transfer.approvedLocation = approvedLocation || transfer.requestedLocation;
    transfer.approvedRelievingDate = approvedRelievingDate ? new Date(approvedRelievingDate) : transfer.requestedRelievingDate;
    transfer.approvedJoiningDate = approvedJoiningDate ? new Date(approvedJoiningDate) : transfer.requestedJoiningDate;
    transfer.status = 'TRANSFER_ORDER_GENERATED';
  } else {
    transfer.status = 'REJECTED';
  }

  await transfer.save();

  res.json({
    success: true,
    data: transfer,
  });
});

// @desc    Generate transfer order
// @route   POST /api/transfers/:id/generate-order
// @access  Private (HR Administrator, Tenant Admin)
exports.generateTransferOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const transfer = await TransferRequest.findById(id)
    .populate('employeeId')
    .populate('approvedLocation.unitId')
    .populate('approvedLocation.reportingManagerId');

  if (!transfer || transfer.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Transfer request not found',
    });
  }

  if (transfer.status !== 'TRANSFER_ORDER_GENERATED') {
    return res.status(400).json({
      success: false,
      message: 'Transfer order can only be generated after HR verification',
    });
  }

  // Generate order number
  const year = new Date().getFullYear();
  const orderNumber = `TO-${year}-${transfer.transferId.split('-')[2]}`;

  transfer.transferOrder = {
    orderNumber,
    orderDate: new Date(),
    orderUrl: `/transfers/${transfer._id}/order`, // Will be generated as PDF
    generatedBy: req.user._id,
  };

  transfer.status = 'RELIEVING_PENDING';
  await transfer.save();

  res.json({
    success: true,
    data: transfer,
  });
});

// @desc    Mark relieving
// @route   PATCH /api/transfers/:id/relieve
// @access  Private (HR Administrator, Tenant Admin)
exports.markRelieved = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { actualRelievingDate } = req.body;

  const transfer = await TransferRequest.findById(id);
  if (!transfer || transfer.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Transfer request not found',
    });
  }

  transfer.actualRelievingDate = actualRelievingDate ? new Date(actualRelievingDate) : new Date();
  transfer.status = 'JOINING_PENDING';

  // Update employee posting
  const employee = await Employee.findById(transfer.employeeId);
  if (employee) {
    // Create posting history entry
    await PostingHistory.create({
      tenantId: req.tenantId,
      employeeId: employee._id,
      fromUnitId: transfer.currentLocation.unitId,
      toUnitId: transfer.approvedLocation.unitId,
      fromLocation: transfer.currentLocation.location,
      toLocation: transfer.approvedLocation.location,
      fromDepartment: transfer.currentLocation.department,
      toDepartment: transfer.approvedLocation.department,
      effectiveDate: transfer.actualRelievingDate,
      transferOrderNumber: transfer.transferOrder.orderNumber,
    });
  }

  await transfer.save();

  res.json({
    success: true,
    data: transfer,
  });
});

// @desc    Mark joining
// @route   PATCH /api/transfers/:id/join
// @access  Private (HR Administrator, Tenant Admin)
exports.markJoined = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { actualJoiningDate } = req.body;

  const transfer = await TransferRequest.findById(id)
    .populate('approvedLocation.unitId')
    .populate('approvedLocation.reportingManagerId');

  if (!transfer || transfer.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Transfer request not found',
    });
  }

  transfer.actualJoiningDate = actualJoiningDate ? new Date(actualJoiningDate) : new Date();
  transfer.status = 'COMPLETED';
  transfer.completedDate = new Date();

  // Update employee record
  const employee = await Employee.findById(transfer.employeeId);
  if (employee && transfer.approvedLocation) {
    employee.postingUnitId = transfer.approvedLocation.unitId;
    employee.location = transfer.approvedLocation.location;
    employee.department = transfer.approvedLocation.department;
    if (transfer.approvedLocation.designation) {
      employee.designation = transfer.approvedLocation.designation;
    }
    if (transfer.approvedLocation.reportingManagerId) {
      employee.reportingManager = transfer.approvedLocation.reportingManagerId;
    }
    await employee.save();
  }

  await transfer.save();

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Complete Transfer',
    module: 'Personnel',
    entityType: 'TransferRequest',
    entityId: transfer._id,
    details: `Transfer completed: ${transfer.transferId}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.json({
    success: true,
    data: transfer,
  });
});
