const Course = require('../models/Course');
const TrainingAssignment = require('../models/TrainingAssignment');
const TrainingCalendar = require('../models/TrainingCalendar');
const Certificate = require('../models/Certificate');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * LMS Controller
 * BRD: BR-P1-005 - Learning Management System
 */

// @desc    Get all courses
// @route   GET /api/lms/courses
// @access  Private
exports.getCourses = asyncHandler(async (req, res) => {
  const { category, courseType, isMandatory, search, page = 1, limit = 50 } = req.query;

  const query = { tenantId: req.tenantId, isActive: true };

  if (category) query.category = category;
  if (courseType) query.courseType = courseType;
  if (isMandatory !== undefined) query.isMandatory = isMandatory === 'true';
  if (search) {
    query.$or = [
      { courseName: { $regex: search, $options: 'i' } },
      { courseCode: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const courses = await Course.find(query)
    .populate('instructor.employeeId', 'firstName lastName employeeCode')
    .sort({ courseName: 1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Course.countDocuments(query);

  res.json({
    success: true,
    data: courses,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// @desc    Create course
// @route   POST /api/lms/courses
// @access  Private (HR Administrator, Tenant Admin)
exports.createCourse = asyncHandler(async (req, res) => {
  const courseData = req.body;

  // Check if course code exists
  const existing = await Course.findOne({
    tenantId: req.tenantId,
    courseCode: courseData.courseCode?.toUpperCase(),
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: 'Course code already exists',
    });
  }

  const course = await Course.create({
    tenantId: req.tenantId,
    ...courseData,
    courseCode: courseData.courseCode?.toUpperCase(),
  });

  // Log audit (use schema-valid action and userName)
  const userObj = req.user || {};
  await AuditLog.create({
    tenantId: req.tenantId,
    userId: userObj._id,
    userName: userObj.name || userObj.email || 'System',
    userEmail: userObj.email,
    action: 'Create',
    module: 'LMS',
    entityType: 'Course',
    entityId: course._id,
    details: `Created course: ${course.courseName} (${course.courseCode})`,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
    status: 'Success',
  });

  res.status(201).json({
    success: true,
    data: course,
  });
});

// @desc    Assign training to employee
// @route   POST /api/lms/assign
// @access  Private (HR Administrator, Tenant Admin, Manager)
exports.assignTraining = asyncHandler(async (req, res) => {
  const { courseId, employeeIds, trainingDate, trainingEndDate, assignmentType } = req.body;

  const course = await Course.findById(courseId);
  if (!course || course.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Course not found',
    });
  }

  const assignments = [];

  for (const empId of employeeIds) {
    const employee = await Employee.findById(empId);
    if (!employee || employee.tenantId.toString() !== req.tenantId.toString()) {
      continue;
    }

    // Check if already assigned
    const existing = await TrainingAssignment.findOne({
      tenantId: req.tenantId,
      courseId,
      employeeId: empId,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
    });

    if (existing) {
      continue; // Skip if already assigned
    }

    const assignment = await TrainingAssignment.create({
      tenantId: req.tenantId,
      courseId,
      employeeId: empId,
      assignmentType: assignmentType || 'NOMINATED',
      assignedBy: req.user._id,
      trainingDate: trainingDate ? new Date(trainingDate) : null,
      trainingEndDate: trainingEndDate ? new Date(trainingEndDate) : null,
    });

    assignments.push(assignment);
  }

  res.status(201).json({
    success: true,
    data: assignments,
    message: `Assigned training to ${assignments.length} employees`,
  });
});

// @desc    Get employee's training assignments
// @route   GET /api/lms/my-trainings
// @access  Private (Employee)
exports.getMyTrainings = asyncHandler(async (req, res) => {
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

  const assignments = await TrainingAssignment.find({
    tenantId: req.tenantId,
    employeeId: employee._id,
  })
    .populate('courseId', 'courseName courseCode duration category')
    .sort({ assignedDate: -1 })
    .lean();

  res.json({
    success: true,
    data: assignments,
  });
});

// @desc    Update training progress
// @route   PATCH /api/lms/assignments/:id/progress
// @access  Private
exports.updateProgress = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, attendance, score, feedback } = req.body;

  const assignment = await TrainingAssignment.findById(id);
  if (!assignment || assignment.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Training assignment not found',
    });
  }

  if (status) assignment.status = status;
  if (attendance) assignment.attendance = attendance;
  if (score !== undefined) {
    assignment.score = score;
    // Check if passed
    const course = await Course.findById(assignment.courseId);
    if (course && course.passingScore) {
      assignment.passed = score >= course.passingScore;
    }
  }
  if (feedback) {
    assignment.feedback = {
      rating: feedback.rating,
      comments: feedback.comments,
      feedbackDate: new Date(),
    };
  }

  if (status === 'COMPLETED') {
    assignment.completionDate = new Date();

    // Issue certificate if required
    const course = await Course.findById(assignment.courseId);
    if (course && course.certificateIssued && assignment.passed) {
      const certificate = await Certificate.create({
        tenantId: req.tenantId,
        courseId: assignment.courseId,
        employeeId: assignment.employeeId,
        trainingAssignmentId: assignment._id,
        score: assignment.score,
        expiryDate: course.certificateValidity
          ? new Date(Date.now() + course.certificateValidity * 30 * 24 * 60 * 60 * 1000)
          : null,
      });

      assignment.certificateIssued = true;
      assignment.certificateId = certificate._id;
      assignment.certificateIssueDate = new Date();
    }
  }

  await assignment.save();

  res.json({
    success: true,
    data: assignment,
  });
});

// @desc    Get training calendar
// @route   GET /api/lms/calendar
// @access  Private
exports.getTrainingCalendar = asyncHandler(async (req, res) => {
  const { startDate, endDate, courseId } = req.query;

  const query = { tenantId: req.tenantId };

  if (startDate || endDate) {
    query.startDate = {};
    if (startDate) query.startDate.$gte = new Date(startDate);
    if (endDate) query.startDate.$lte = new Date(endDate);
  }
  if (courseId) query.courseId = courseId;

  const calendar = await TrainingCalendar.find(query)
    .populate('courseId', 'courseName courseCode')
    .populate('instructor.employeeId', 'firstName lastName')
    .sort({ startDate: 1 })
    .lean();

  res.json({
    success: true,
    data: calendar,
  });
});

// @desc    Create training calendar entry
// @route   POST /api/lms/calendar
// @access  Private (HR Administrator, Tenant Admin)
exports.createTrainingCalendar = asyncHandler(async (req, res) => {
  const calendarData = req.body;

  const calendar = await TrainingCalendar.create({
    tenantId: req.tenantId,
    ...calendarData,
    startDate: new Date(calendarData.startDate),
    endDate: new Date(calendarData.endDate),
  });

  await calendar.populate('courseId', 'courseName courseCode');

  res.status(201).json({
    success: true,
    data: calendar,
  });
});

// @desc    Get certificates
// @route   GET /api/lms/certificates
// @access  Private
exports.getCertificates = asyncHandler(async (req, res) => {
  const { employeeId } = req.query;

  const query = { tenantId: req.tenantId, revoked: false };

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

  const certificates = await Certificate.find(query)
    .populate('courseId', 'courseName courseCode')
    .populate('employeeId', 'firstName lastName employeeCode')
    .sort({ issueDate: -1 })
    .lean();

  res.json({
    success: true,
    data: certificates,
  });
});
