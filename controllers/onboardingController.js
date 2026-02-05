const Onboarding = require('../models/Onboarding');
const Employee = require('../models/Employee');
const { generateEmployeeId, generatePortalToken, generateTemporaryPassword } = require('../services/employeeIdService');
const { createAuditLog } = require('../utils/auditLog');
const { sendNotification } = require('../utils/notificationService');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

// @desc    Get all onboarding records
// @route   GET /api/onboarding
// @access  Private (HR Admin, Tenant Admin)
exports.getOnboardings = asyncHandler(async (req, res) => {
  const { status, department } = req.query;
  const filter = { tenantId: req.tenantId };

  if (status) filter.status = status;
  if (department) filter.department = department;

  const onboardings = await Onboarding.find(filter)
    .populate('employeeId', 'firstName lastName employeeCode department designation')
    .populate('assignedTo', 'name email')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: onboardings.length,
    data: onboardings,
  });
});

// @desc    Get single onboarding record
// @route   GET /api/onboarding/:id
// @access  Private (HR Admin, Tenant Admin)
exports.getOnboarding = asyncHandler(async (req, res) => {
  const onboarding = await Onboarding.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('employeeId', 'firstName lastName employeeCode department designation email')
    .populate('assignedTo', 'name email');

  if (!onboarding) {
    return res.status(404).json({
      success: false,
      message: 'Onboarding record not found',
    });
  }

  res.status(200).json({
    success: true,
    data: onboarding,
  });
});

// @desc    Create onboarding record
// @route   POST /api/onboarding
// @access  Private (HR Admin, Tenant Admin)
exports.createOnboarding = asyncHandler(async (req, res) => {
  if (!req.tenantId) {
    return res.status(400).json({
      success: false,
      message: 'Tenant ID is required',
    });
  }

  req.body.tenantId = req.tenantId;
  req.body.assignedTo = req.body.assignedTo || req.user._id;

  // Generate portal token and password
  const portalToken = generatePortalToken();
  const portalPassword = generateTemporaryPassword();
  
  req.body.portalToken = portalToken;
  req.body.portalPassword = portalPassword;

  // Default tasks if not provided
  if (!req.body.tasks || req.body.tasks.length === 0) {
    req.body.tasks = [
      { title: 'Offer Letter Acceptance', completed: false, dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      { title: 'Document Collection', completed: false, dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
      { title: 'Aadhaar Verification', completed: false },
      { title: 'PAN Verification', completed: false },
      { title: 'Background Verification', completed: false },
      { title: 'System Access Setup', completed: false },
      { title: 'Induction Training', completed: false },
    ];
  }

  const onboarding = await Onboarding.create(req.body);

  // Send portal access email
  await sendNotification({
    tenantId: req.tenantId,
    recipientEmail: onboarding.candidateEmail,
    recipientName: onboarding.candidateName,
    subject: 'Welcome to Indian Bank - Pre-joining Portal Access',
    message: `Dear ${onboarding.candidateName}, Your pre-joining portal access has been created. Please use the credentials provided to access the portal.`,
    html: `
      <p>Dear ${onboarding.candidateName},</p>
      <p>Welcome to Indian Bank! Your pre-joining portal access has been created.</p>
      <p><strong>Portal URL:</strong> <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/onboarding/pre-joining?token=${portalToken}">Access Portal</a></p>
      <p><strong>Temporary Password:</strong> ${portalPassword}</p>
      <p>Please complete all onboarding tasks before your joining date.</p>
    `,
  });

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'Onboarding',
    entityType: 'Onboarding',
    entityId: onboarding._id,
    description: `Onboarding created for ${onboarding.candidateName}`,
  });

  res.status(201).json({
    success: true,
    data: onboarding,
  });
});

// @desc    Update onboarding record
// @route   PUT /api/onboarding/:id
// @access  Private (HR Admin, Tenant Admin)
exports.updateOnboarding = asyncHandler(async (req, res) => {
  let onboarding = await Onboarding.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!onboarding) {
    return res.status(404).json({
      success: false,
      message: 'Onboarding record not found',
    });
  }

  onboarding = await Onboarding.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: onboarding,
  });
});

// @desc    Update onboarding task
// @route   PUT /api/onboarding/:id/task/:taskId
// @access  Private (HR Admin, Tenant Admin)
exports.updateOnboardingTask = asyncHandler(async (req, res) => {
  const { completed, completedDate } = req.body;
  const onboarding = await Onboarding.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!onboarding) {
    return res.status(404).json({
      success: false,
      message: 'Onboarding record not found',
    });
  }

  const task = onboarding.tasks.id(req.params.taskId);
  if (!task) {
    return res.status(404).json({
      success: false,
      message: 'Task not found',
    });
  }

  task.completed = completed !== undefined ? completed : task.completed;
  if (completed && completedDate) {
    task.completedDate = new Date(completedDate);
  } else if (completed) {
    task.completedDate = Date.now();
  }

  await onboarding.save();

  res.status(200).json({
    success: true,
    data: onboarding,
  });
});

// @desc    Complete onboarding and create employee record
// @route   POST /api/onboarding/:id/complete
// @access  Private (HR Admin, Tenant Admin)
exports.completeOnboarding = asyncHandler(async (req, res) => {
  const onboarding = await Onboarding.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!onboarding) {
    return res.status(404).json({
      success: false,
      message: 'Onboarding record not found',
    });
  }

  // Check if all tasks are completed
  const allTasksCompleted = onboarding.tasks.every(task => task.completed);
  if (!allTasksCompleted) {
    return res.status(400).json({
      success: false,
      message: 'All onboarding tasks must be completed before finalizing',
    });
  }

  // Generate employee ID
  const employeeCode = await generateEmployeeId(req.tenantId, onboarding.department);

  // Create employee record
  const employee = await Employee.create({
    tenantId: req.tenantId,
    employeeCode,
    firstName: onboarding.candidateName.split(' ')[0],
    lastName: onboarding.candidateName.split(' ').slice(1).join(' ') || '',
    email: onboarding.candidateEmail,
    phone: onboarding.candidatePhone,
    department: onboarding.department,
    designation: onboarding.designation || onboarding.position,
    joiningDate: onboarding.joiningDate,
    status: 'Active',
  });

  // Update onboarding
  onboarding.employeeId = employee._id;
  onboarding.employeeCode = employeeCode;
  onboarding.status = 'Completed';
  await onboarding.save();

  // Create probation record
  const Probation = require('../models/Probation');
  await Probation.create({
    tenantId: req.tenantId,
    employeeId: employee._id,
    onboardingId: onboarding._id,
    startDate: onboarding.joiningDate,
    duration: 6, // Default 6 months
    status: 'Active',
  });

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'Onboarding',
    entityId: onboarding._id,
    description: `Onboarding completed. Employee created: ${employeeCode}`,
  });

  res.status(200).json({
    success: true,
    data: {
      onboarding,
      employee,
      employeeCode,
    },
    message: 'Onboarding completed successfully. Employee record created.',
  });
});

// @desc    Delete onboarding record
// @route   DELETE /api/onboarding/:id
// @access  Private (HR Admin, Tenant Admin)
exports.deleteOnboarding = asyncHandler(async (req, res) => {
  const onboarding = await Onboarding.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!onboarding) {
    return res.status(404).json({
      success: false,
      message: 'Onboarding record not found',
    });
  }

  await onboarding.deleteOne();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'DELETE',
    module: 'Onboarding',
    entityType: 'Onboarding',
    entityId: req.params.id,
    description: 'Onboarding record deleted',
  });

  res.status(200).json({
    success: true,
    message: 'Onboarding record deleted successfully',
  });
});
