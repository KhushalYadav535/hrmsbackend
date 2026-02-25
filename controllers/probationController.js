const Probation = require('../models/Probation');
const Employee = require('../models/Employee');
const Onboarding = require('../models/Onboarding');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { createAuditLog } = require('../utils/auditLog');
const { sendNotification } = require('../utils/notificationService');

/**
 * Create probation record
 * BRD: BR-ONB-009
 */
exports.createProbation = asyncHandler(async (req, res) => {
  const { employeeId, onboardingId, startDate, duration } = req.body;
  
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

  // Check if probation already exists
  const existingProbation = await Probation.findOne({
    tenantId: req.tenantId,
    employeeId,
  });

  if (existingProbation) {
    return res.status(400).json({
      success: false,
      message: 'Probation record already exists for this employee',
    });
  }

  const probationDuration = duration || 6; // Default 6 months
  const start = new Date(startDate);
  const end = new Date(start);
  end.setMonth(end.getMonth() + probationDuration);

  const probation = await Probation.create({
    tenantId: req.tenantId,
    employeeId,
    onboardingId,
    startDate: start,
    endDate: end,
    duration: probationDuration,
    status: 'Active',
  });

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'Create',
    entityType: 'Probation',
    entityId: probation._id,
    description: `Probation created for employee ${employee.firstName} ${employee.lastName}`,
  });

  res.status(201).json({
    success: true,
    data: probation,
  });
});

/**
 * Add probation review
 */
exports.addProbationReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reviewDate, rating, comments, recommendation } = req.body;
  
  const probation = await Probation.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!probation) {
    return res.status(404).json({
      success: false,
      message: 'Probation record not found',
    });
  }

  probation.reviews.push({
    reviewDate: reviewDate || Date.now(),
    reviewedBy: req.user._id,
    rating,
    comments,
    recommendation,
  });

  await probation.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'Probation',
    entityId: probation._id,
    description: 'Probation review added',
  });

  res.status(200).json({
    success: true,
    data: probation,
  });
});

/**
 * Confirm employee (end probation)
 */
exports.confirmEmployee = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { confirmationLetterUrl } = req.body;
  
  const probation = await Probation.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!probation) {
    return res.status(404).json({
      success: false,
      message: 'Probation record not found',
    });
  }

  probation.status = 'Confirmed';
  probation.confirmedDate = Date.now();
  probation.confirmedBy = req.user._id;
  probation.confirmationLetterUrl = confirmationLetterUrl;

  await probation.save();

  // Update employee status if needed
  const employee = await Employee.findById(probation.employeeId);
  if (employee) {
    employee.status = 'Active'; // Or whatever status indicates confirmed
    await employee.save();
  }

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'Probation',
    entityId: probation._id,
    description: 'Employee confirmed',
  });

  res.status(200).json({
    success: true,
    data: probation,
  });
});

/**
 * Extend probation
 */
exports.extendProbation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { extensionReason, additionalMonths } = req.body;
  
  const probation = await Probation.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!probation) {
    return res.status(404).json({
      success: false,
      message: 'Probation record not found',
    });
  }

  probation.status = 'Extended';
  probation.extendedDate = Date.now();
  probation.extendedBy = req.user._id;
  probation.extensionReason = extensionReason;
  
  const newEndDate = new Date(probation.endDate);
  newEndDate.setMonth(newEndDate.getMonth() + (additionalMonths || 3));
  probation.newEndDate = newEndDate;
  probation.endDate = newEndDate;
  probation.duration += additionalMonths || 3;

  await probation.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'Probation',
    entityId: probation._id,
    description: `Probation extended by ${additionalMonths || 3} months`,
  });

  res.status(200).json({
    success: true,
    data: probation,
  });
});

/**
 * Get probation records
 */
exports.getProbations = asyncHandler(async (req, res) => {
  const { employeeId, status } = req.query;
  const filter = { tenantId: req.tenantId };

  if (employeeId) filter.employeeId = employeeId;
  if (status) filter.status = status;

  const probations = await Probation.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode')
    .populate('confirmedBy', 'name email')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: probations.length,
    data: probations,
  });
});

/**
 * Get single probation
 */
exports.getProbation = asyncHandler(async (req, res) => {
  const probation = await Probation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('employeeId', 'firstName lastName employeeCode department designation')
    .populate('confirmedBy', 'name email')
    .populate('reviews.reviewedBy', 'name email');

  if (!probation) {
    return res.status(404).json({
      success: false,
      message: 'Probation record not found',
    });
  }

  res.status(200).json({
    success: true,
    data: probation,
  });
});

/**
 * Get probations due for reminder
 * BRD: BR-ONB-009
 */
exports.getProbationsDueForReminder = asyncHandler(async (req, res) => {
  const { daysBefore } = req.query;
  const days = parseInt(daysBefore) || 30;
  
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + days);

  const probations = await Probation.find({
    tenantId: req.tenantId,
    status: 'Active',
    endDate: { $lte: targetDate, $gte: new Date() },
  })
    .populate('employeeId', 'firstName lastName employeeCode email')
    .populate('onboardingId', 'candidateEmail');

  res.status(200).json({
    success: true,
    count: probations.length,
    data: probations,
  });
});
