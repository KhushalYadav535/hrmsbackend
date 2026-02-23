const Grievance = require('../models/Grievance');
const Employee = require('../models/Employee');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { sendNotification } = require('../utils/notificationService');

/**
 * Grievance Controller
 * BRD: BR-P1-004 - Grievance Management Module
 */

// @desc    Submit grievance
// @route   POST /api/grievances
// @access  Private (Employee)
exports.submitGrievance = asyncHandler(async (req, res) => {
  const {
    category,
    subCategory,
    subject,
    description,
    incidentDate,
    incidentLocation,
    witnesses,
    documents,
    preferredResolution,
    confidentialityRequired,
    anonymousSubmission,
  } = req.body;

  // Get employee
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

  // Create grievance
  const grievance = await Grievance.create({
    tenantId: req.tenantId,
    employeeId: employee._id,
    category,
    subCategory,
    subject,
    description,
    incidentDate: incidentDate ? new Date(incidentDate) : undefined,
    incidentLocation,
    witnesses: witnesses || [],
    documents: documents || [],
    preferredResolution,
    confidentialityRequired: confidentialityRequired || false,
    anonymousSubmission: anonymousSubmission || false,
    submittedDate: new Date(),
    acknowledgedDate: new Date(),
  });

  // Populate employee details
  await grievance.populate('employeeId', 'firstName lastName employeeCode email');

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Submit Grievance',
    module: 'Grievance Management',
    entityType: 'Grievance',
    entityId: grievance._id,
    details: `Grievance ${grievance.grievanceId} submitted: ${subject}`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  // TODO: Send acknowledgment email
  // await sendNotification({
  //   to: employee.email,
  //   subject: `Grievance Acknowledged: ${grievance.grievanceId}`,
  //   template: 'grievance-acknowledgment',
  //   data: { grievanceId: grievance.grievanceId, subject },
  // });

  res.status(201).json({
    success: true,
    data: grievance,
    message: `Grievance submitted successfully. Grievance ID: ${grievance.grievanceId}`,
  });
});

// @desc    Get my grievances
// @route   GET /api/grievances/my-grievances
// @access  Private (Employee)
exports.getMyGrievances = asyncHandler(async (req, res) => {
  const { status, category } = req.query;
  const query = {
    tenantId: req.tenantId,
    employeeId: req.user.employeeId,
  };

  if (status) query.status = status;
  if (category) query.category = category;

  const grievances = await Grievance.find(query)
    .populate('assignedTo', 'name email')
    .sort({ submittedDate: -1 })
    .lean();

  res.json({
    success: true,
    data: grievances,
  });
});

// @desc    Get grievance details
// @route   GET /api/grievances/:id
// @access  Private
exports.getGrievance = asyncHandler(async (req, res) => {
  const grievance = await Grievance.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('employeeId', 'firstName lastName employeeCode email department designation')
    .populate('assignedTo', 'name email role')
    .populate('comments.commentedBy', 'name email role')
    .populate('escalationHistory.escalatedBy', 'name email')
    .populate('escalationHistory.escalatedTo', 'name email')
    .populate('resolution.proposedBy', 'name email')
    .populate('resolution.approvedBy', 'name email')
    .populate('appeal.appealReviewedBy', 'name email');

  if (!grievance) {
    return res.status(404).json({
      success: false,
      message: 'Grievance not found',
    });
  }

  // Check access: Employee can only see own grievances
  if (req.user.role === 'Employee' && grievance.employeeId._id.toString() !== req.user.employeeId?.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  }

  res.json({
    success: true,
    data: grievance,
  });
});

// @desc    Get all grievances (HR/Admin)
// @route   GET /api/grievances
// @access  Private (HR Administrator, Tenant Admin, Manager)
exports.getAllGrievances = asyncHandler(async (req, res) => {
  const {
    status,
    category,
    severity,
    assignedTo,
    slaStatus,
    department,
    search,
    page = 1,
    limit = 50,
  } = req.query;

  const query = { tenantId: req.tenantId };

  if (status) query.status = status;
  if (category) query.category = category;
  if (severity) query.severity = severity;
  if (assignedTo) query.assignedTo = assignedTo;
  if (slaStatus) query.slaStatus = slaStatus;

  // Manager can only see grievances from their team
  if (req.user.role === 'Manager' && req.user.employeeId) {
    const manager = await Employee.findById(req.user.employeeId);
    if (manager) {
      const teamMembers = await Employee.find({
        tenantId: req.tenantId,
        reportingManager: manager._id,
      }).select('_id');
      query.employeeId = { $in: teamMembers.map(e => e._id) };
    }
  }

  if (search) {
    query.$or = [
      { grievanceId: { $regex: search, $options: 'i' } },
      { subject: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const grievances = await Grievance.find(query)
    .populate('employeeId', 'firstName lastName employeeCode email department')
    .populate('assignedTo', 'name email')
    .sort({ submittedDate: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Grievance.countDocuments(query);

  res.json({
    success: true,
    data: grievances,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// @desc    Assign grievance
// @route   PATCH /api/grievances/:id/assign
// @access  Private (HR Administrator, Tenant Admin)
exports.assignGrievance = asyncHandler(async (req, res) => {
  const { assignedTo, assignedDepartment, severity } = req.body;

  const grievance = await Grievance.findById(req.params.id);

  if (!grievance || grievance.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Grievance not found',
    });
  }

  grievance.assignedTo = assignedTo;
  grievance.assignedDepartment = assignedDepartment;
  if (severity) grievance.severity = severity;
  grievance.status = 'ASSIGNED';
  grievance.assignedDate = new Date();

  await grievance.save();

  // Log audit
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Assign Grievance',
    module: 'Grievance Management',
    entityType: 'Grievance',
    entityId: grievance._id,
    details: `Grievance ${grievance.grievanceId} assigned`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.json({
    success: true,
    data: grievance,
    message: 'Grievance assigned successfully',
  });
});

// @desc    Add comment
// @route   POST /api/grievances/:id/comments
// @access  Private
exports.addComment = asyncHandler(async (req, res) => {
  const { comment, isInternal = false } = req.body;

  const grievance = await Grievance.findById(req.params.id);

  if (!grievance || grievance.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Grievance not found',
    });
  }

  // Check access
  if (req.user.role === 'Employee' && grievance.employeeId.toString() !== req.user.employeeId?.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  }

  grievance.comments.push({
    commentedBy: req.user._id,
    comment,
    isInternal,
  });

  // Update status if under review
  if (grievance.status === 'UNDER_REVIEW' && !isInternal) {
    grievance.status = 'INVESTIGATION';
    grievance.investigationStartDate = new Date();
  }

  await grievance.save();

  await grievance.populate('comments.commentedBy', 'name email role');

  res.json({
    success: true,
    data: grievance,
    message: 'Comment added successfully',
  });
});

// @desc    Propose resolution
// @route   POST /api/grievances/:id/resolution
// @access  Private (HR Administrator, Tenant Admin, Assigned Officer)
exports.proposeResolution = asyncHandler(async (req, res) => {
  const { resolutionDetails, actionTaken } = req.body;

  const grievance = await Grievance.findById(req.params.id);

  if (!grievance || grievance.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Grievance not found',
    });
  }

  grievance.resolution = {
    proposedBy: req.user._id,
    proposedDate: new Date(),
    resolutionDetails,
    actionTaken,
  };
  grievance.status = 'RESOLUTION_PROPOSED';
  grievance.resolutionProposedDate = new Date();

  await grievance.save();

  res.json({
    success: true,
    data: grievance,
    message: 'Resolution proposed successfully',
  });
});

// @desc    Approve resolution
// @route   POST /api/grievances/:id/resolution/approve
// @access  Private (HR Administrator, Tenant Admin, Finance Head, etc.)
exports.approveResolution = asyncHandler(async (req, res) => {
  const { implementationDate } = req.body;

  const grievance = await Grievance.findById(req.params.id);

  if (!grievance || grievance.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Grievance not found',
    });
  }

  grievance.resolution.approvedBy = req.user._id;
  grievance.resolution.approvedDate = new Date();
  grievance.resolution.implementationDate = implementationDate ? new Date(implementationDate) : new Date();
  grievance.status = 'RESOLVED';
  grievance.resolvedDate = new Date();

  await grievance.save();

  res.json({
    success: true,
    data: grievance,
    message: 'Resolution approved successfully',
  });
});

// @desc    Submit feedback
// @route   POST /api/grievances/:id/feedback
// @access  Private (Employee - owner of grievance)
exports.submitFeedback = asyncHandler(async (req, res) => {
  const { satisfactionRating, feedback } = req.body;

  const grievance = await Grievance.findById(req.params.id);

  if (!grievance || grievance.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Grievance not found',
    });
  }

  // Check if employee owns this grievance
  if (grievance.employeeId.toString() !== req.user.employeeId?.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  }

  grievance.employeeFeedback = {
    satisfactionRating,
    feedback,
    feedbackDate: new Date(),
  };

  // Close if satisfied (rating >= 4), otherwise keep open
  if (satisfactionRating >= 4) {
    grievance.status = 'CLOSED';
    grievance.closedDate = new Date();
  }

  await grievance.save();

  res.json({
    success: true,
    data: grievance,
    message: 'Feedback submitted successfully',
  });
});

// @desc    Get grievance dashboard stats
// @route   GET /api/grievances/dashboard/stats
// @access  Private (HR Administrator, Tenant Admin, Manager)
exports.getDashboardStats = asyncHandler(async (req, res) => {
  const query = { tenantId: req.tenantId };

  // Manager can only see stats for their team
  if (req.user.role === 'Manager' && req.user.employeeId) {
    const manager = await Employee.findById(req.user.employeeId);
    if (manager) {
      const teamMembers = await Employee.find({
        tenantId: req.tenantId,
        reportingManager: manager._id,
      }).select('_id');
      query.employeeId = { $in: teamMembers.map(e => e._id) };
    }
  }

  const [
    total,
    open,
    resolved,
    closed,
    atRisk,
    breached,
    byCategory,
    bySeverity,
  ] = await Promise.all([
    Grievance.countDocuments(query),
    Grievance.countDocuments({ ...query, status: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED', 'INVESTIGATION', 'RESOLUTION_PROPOSED'] } }),
    Grievance.countDocuments({ ...query, status: 'RESOLVED' }),
    Grievance.countDocuments({ ...query, status: 'CLOSED' }),
    Grievance.countDocuments({ ...query, slaStatus: 'AT_RISK' }),
    Grievance.countDocuments({ ...query, slaStatus: 'BREACHED' }),
    Grievance.aggregate([
      { $match: query },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
    Grievance.aggregate([
      { $match: query },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      total,
      open,
      resolved,
      closed,
      atRisk,
      breached,
      byCategory: byCategory.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      bySeverity: bySeverity.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    },
  });
});
