const ProfileUpdateRequest = require('../models/ProfileUpdateRequest');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * Profile Update Request Controller
 * BRD: BR-P2-005 - ESS Profile update request workflow
 */

const ALLOWED_FIELDS = ['phone', 'address', 'bloodGroup', 'maritalStatus', 'passportNumber'];

// @desc    Create profile update request
// @route   POST /api/profile-update-requests
// @access  Private (Employee, Manager)
exports.createRequest = asyncHandler(async (req, res) => {
  const { requestType, requestedFields, reason } = req.body;

  const employee = await Employee.findOne({
    tenantId: req.tenantId,
    $or: [
      { _id: req.user.employeeId },
      { email: req.user.email },
    ],
  });

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found',
    });
  }

  if (!requestedFields || !Array.isArray(requestedFields) || requestedFields.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one field update is required',
    });
  }

  const validFields = requestedFields.filter((f) => ALLOWED_FIELDS.includes(f.field));
  if (validFields.length === 0) {
    return res.status(400).json({
      success: false,
      message: `Allowed fields: ${ALLOWED_FIELDS.join(', ')}`,
    });
  }

  const fieldsWithValues = validFields.map((f) => ({
    field: f.field,
    currentValue: employee[f.field],
    requestedValue: f.requestedValue,
    label: f.label || f.field,
  }));

  const request = await ProfileUpdateRequest.create({
    tenantId: req.tenantId,
    employeeId: employee._id,
    requestType: requestType || 'PERSONAL',
    requestedFields: fieldsWithValues,
    reason: reason || '',
    requestedBy: req.user._id,
    status: 'Pending',
  });

  await request.populate('employeeId', 'firstName lastName employeeCode');

  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Create Profile Update Request',
    module: 'ESS',
    entityType: 'ProfileUpdateRequest',
    entityId: request._id,
    details: `Requested updates for: ${validFields.map((f) => f.field).join(', ')}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    data: request,
    message: 'Profile update request submitted successfully',
  });
});

// @desc    Get profile update requests (own or all for HR)
// @route   GET /api/profile-update-requests
// @access  Private
exports.getRequests = asyncHandler(async (req, res) => {
  const { employeeId, status, page = 1, limit = 20 } = req.query;

  const query = { tenantId: req.tenantId };

  const isHR = ['HR Administrator', 'Tenant Admin', 'Super Admin'].includes(req.user.role);
  if (!isHR && req.user.employeeId) {
    const emp = await Employee.findOne({
      tenantId: req.tenantId,
      $or: [{ _id: req.user.employeeId }, { email: req.user.email }],
    });
    if (emp) query.employeeId = emp._id;
    else query.employeeId = req.user.employeeId;
  } else if (employeeId) {
    query.employeeId = employeeId;
  }

  if (status) query.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const requests = await ProfileUpdateRequest.find(query)
    .populate('employeeId', 'firstName lastName employeeCode email')
    .populate('requestedBy', 'name email')
    .populate('reviewedBy', 'name email')
    .sort({ requestedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await ProfileUpdateRequest.countDocuments(query);

  res.json({
    success: true,
    data: requests,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// @desc    Get single request
// @route   GET /api/profile-update-requests/:id
// @access  Private
exports.getRequest = asyncHandler(async (req, res) => {
  const request = await ProfileUpdateRequest.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('employeeId', 'firstName lastName employeeCode email phone address')
    .populate('requestedBy', 'name email')
    .populate('reviewedBy', 'name email')
    .lean();

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'Request not found',
    });
  }

  const isHR = ['HR Administrator', 'Tenant Admin', 'Super Admin'].includes(req.user.role);
  if (!isHR && req.user.employeeId?.toString() !== request.employeeId?._id?.toString()) {
    const emp = await Employee.findOne({ tenantId: req.tenantId, email: req.user.email });
    if (!emp || emp._id.toString() !== request.employeeId?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this request',
      });
    }
  }

  res.json({
    success: true,
    data: request,
  });
});

// @desc    Approve/Reject profile update request
// @route   PATCH /api/profile-update-requests/:id/review
// @access  Private (HR Administrator, Tenant Admin, Manager)
exports.reviewRequest = asyncHandler(async (req, res) => {
  const { action, reviewComments } = req.body;

  if (!['Approved', 'Rejected'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Action must be Approved or Rejected',
    });
  }

  const request = await ProfileUpdateRequest.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  }).populate('employeeId');

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'Request not found',
    });
  }

  if (request.status !== 'Pending') {
    return res.status(400).json({
      success: false,
      message: `Request is already ${request.status}`,
    });
  }

  request.status = action;
  request.reviewedBy = req.user._id;
  request.reviewedAt = new Date();
  request.reviewComments = reviewComments || '';
  await request.save();

  if (action === 'Approved') {
    const employee = await Employee.findById(request.employeeId._id);
    if (employee) {
      for (const f of request.requestedFields) {
        if (ALLOWED_FIELDS.includes(f.field) && f.requestedValue !== undefined) {
          employee[f.field] = f.requestedValue;
        }
      }
      await employee.save();
    }
  }

  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: `${action} Profile Update Request`,
    module: 'ESS',
    entityType: 'ProfileUpdateRequest',
    entityId: request._id,
    details: `Updated fields: ${request.requestedFields.map((f) => f.field).join(', ')}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.json({
    success: true,
    data: request,
    message: `Request ${action.toLowerCase()} successfully`,
  });
});
