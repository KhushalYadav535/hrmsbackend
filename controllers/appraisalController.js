const AppraisalCycle = require('../models/AppraisalCycle');
const Appraisal = require('../models/Appraisal');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * Appraisal Controller
 * BRD: BR-P1-001 - Performance Appraisal Complete Workflow
 */

// @desc    Create appraisal cycle
// @route   POST /api/appraisal/cycles
// @access  Private (HR Administrator, Tenant Admin)
exports.createCycle = asyncHandler(async (req, res) => {
  const {
    cycleName,
    cycleType,
    startDate,
    endDate,
    selfAssessmentDeadline,
    managerReviewDeadline,
    normalizationDeadline,
    applicableTo,
    applicableDepartments,
    applicableGrades,
  } = req.body;

  const cycle = await AppraisalCycle.create({
    tenantId: req.tenantId,
    cycleName,
    cycleType,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    selfAssessmentDeadline: new Date(selfAssessmentDeadline),
    managerReviewDeadline: new Date(managerReviewDeadline),
    normalizationDeadline: new Date(normalizationDeadline),
    applicableTo,
    applicableDepartments: applicableDepartments || [],
    applicableGrades: applicableGrades || [],
    status: 'DRAFT',
  });

  res.status(201).json({
    success: true,
    data: cycle,
  });
});

// @desc    Activate appraisal cycle
// @route   PATCH /api/appraisal/cycles/:id/activate
// @access  Private (HR Administrator, Tenant Admin)
exports.activateCycle = asyncHandler(async (req, res) => {
  const cycle = await AppraisalCycle.findById(req.params.id);

  if (!cycle || cycle.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Cycle not found',
    });
  }

  // Create appraisals for all applicable employees
  const query = { tenantId: req.tenantId, status: 'Active' };
  
  if (cycle.applicableTo === 'DEPARTMENTS' && cycle.applicableDepartments.length > 0) {
    query.department = { $in: cycle.applicableDepartments };
  }
  // Note: Grade filtering would need grade field in Employee model

  const employees = await Employee.find(query).select('_id reportingManager');

  // Create appraisals
  const appraisals = [];
  for (const emp of employees) {
    const existing = await Appraisal.findOne({
      tenantId: req.tenantId,
      cycleId: cycle._id,
      employeeId: emp._id,
    });

    if (!existing) {
      appraisals.push({
        tenantId: req.tenantId,
        cycleId: cycle._id,
        employeeId: emp._id,
        managerId: emp.reportingManager || emp._id, // Fallback to self if no manager
        status: 'GOAL_SETTING',
      });
    }
  }

  if (appraisals.length > 0) {
    await Appraisal.insertMany(appraisals);
  }

  cycle.status = 'ACTIVE';
  await cycle.save();

  res.json({
    success: true,
    data: cycle,
    message: `Cycle activated. Created ${appraisals.length} appraisals.`,
  });
});

// @desc    Get my appraisal
// @route   GET /api/appraisal/my-appraisal
// @access  Private (Employee)
exports.getMyAppraisal = asyncHandler(async (req, res) => {
  const { cycleId } = req.query;

  const query = {
    tenantId: req.tenantId,
    employeeId: req.user.employeeId,
  };

  if (cycleId) {
    query.cycleId = cycleId;
  }

  const appraisal = await Appraisal.findOne(query)
    .populate('cycleId', 'cycleName cycleType startDate endDate')
    .populate('managerId', 'firstName lastName employeeCode')
    .lean();

  if (!appraisal) {
    return res.status(404).json({
      success: false,
      message: 'Appraisal not found',
    });
  }

  res.json({
    success: true,
    data: appraisal,
  });
});

// @desc    Submit self-assessment
// @route   POST /api/appraisal/:id/self-assessment
// @access  Private (Employee)
exports.submitSelfAssessment = asyncHandler(async (req, res) => {
  const {
    competencyRatings,
    trainingNeeds,
    careerAspirations,
    achievements,
    challengesFaced,
    overallComments,
    goalAchievements,
  } = req.body;

  const appraisal = await Appraisal.findById(req.params.id);

  if (!appraisal || appraisal.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Appraisal not found',
    });
  }

  if (appraisal.employeeId.toString() !== req.user.employeeId?.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  }

  // Update goal achievements
  if (goalAchievements && Array.isArray(goalAchievements)) {
    goalAchievements.forEach((ga) => {
      const goal = appraisal.goals.id(ga.goalId);
      if (goal) {
        goal.employeeAchievement = ga.achievement;
      }
    });
  }

  appraisal.selfAssessment = {
    submitted: true,
    submittedDate: new Date(),
    competencyRatings: competencyRatings || {},
    trainingNeeds: trainingNeeds || [],
    careerAspirations: careerAspirations || {},
    achievements,
    challengesFaced,
    overallComments,
  };

  appraisal.status = 'SELF_ASSESSMENT_SUBMITTED';
  await appraisal.save();

  res.json({
    success: true,
    data: appraisal,
    message: 'Self-assessment submitted successfully',
  });
});

// @desc    Submit manager review
// @route   POST /api/appraisal/:id/manager-review
// @access  Private (Manager)
exports.submitManagerReview = asyncHandler(async (req, res) => {
  const {
    competencyRatings,
    overallPerformanceRating,
    strengths,
    developmentAreas,
    developmentPlan,
    trainingRecommendations,
    promotionRecommendation,
    retentionRisk,
    incrementRecommendation,
    commentsToEmployee,
    goalRatings,
  } = req.body;

  const appraisal = await Appraisal.findById(req.params.id);

  if (!appraisal || appraisal.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Appraisal not found',
    });
  }

  // Check if user is the manager
  if (appraisal.managerId.toString() !== req.user.employeeId?.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Only the assigned manager can submit review',
    });
  }

  // Update goal ratings
  if (goalRatings && Array.isArray(goalRatings)) {
    goalRatings.forEach((gr) => {
      const goal = appraisal.goals.id(gr.goalId);
      if (goal) {
        goal.managerAchievement = gr.achievement;
        goal.finalAchievement = gr.achievement; // Initially same as manager rating
      }
    });
  }

  appraisal.managerReview = {
    submitted: true,
    submittedDate: new Date(),
    competencyRatings: competencyRatings || {},
    overallPerformanceRating,
    strengths,
    developmentAreas,
    developmentPlan,
    trainingRecommendations: trainingRecommendations || [],
    promotionRecommendation: promotionRecommendation || false,
    retentionRisk: retentionRisk || false,
    incrementRecommendation: incrementRecommendation || {},
    commentsToEmployee,
  };

  appraisal.finalRating = overallPerformanceRating;
  appraisal.status = 'MANAGER_REVIEW_SUBMITTED';
  await appraisal.save();

  res.json({
    success: true,
    data: appraisal,
    message: 'Manager review submitted successfully',
  });
});

// @desc    Normalize ratings
// @route   POST /api/appraisal/normalize
// @access  Private (HR Administrator, Tenant Admin)
exports.normalizeRatings = asyncHandler(async (req, res) => {
  const { cycleId, department, adjustments } = req.body;

  const cycle = await AppraisalCycle.findById(cycleId);
  if (!cycle || cycle.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(404).json({
      success: false,
      message: 'Cycle not found',
    });
  }

  const query = {
    tenantId: req.tenantId,
    cycleId: cycle._id,
    status: 'MANAGER_REVIEW_SUBMITTED',
  };

  if (department) {
    const employees = await Employee.find({ tenantId: req.tenantId, department }).select('_id');
    query.employeeId = { $in: employees.map(e => e._id) };
  }

  const appraisals = await Appraisal.find(query).populate('employeeId', 'department');

  // Get current distribution
  const distribution = {
    5: 0, // Outstanding
    4: 0, // Exceeds
    3: 0, // Meets
    2: 0, // Needs Improvement
    1: 0, // Unsatisfactory
  };

  appraisals.forEach(a => {
    const rating = a.finalRating || a.managerReview?.overallPerformanceRating;
    if (rating) {
      distribution[rating]++;
    }
  });

  const total = appraisals.length;
  const targetDistribution = {
    5: Math.ceil(total * 0.10), // Max 10%
    4: Math.ceil(total * 0.20), // Max 20%
    3: Math.ceil(total * 0.60), // 50-60%
    2: Math.ceil(total * 0.15), // Max 15%
    1: Math.ceil(total * 0.05), // Max 5%
  };

  // Apply adjustments if provided
  if (adjustments && Array.isArray(adjustments)) {
    for (const adj of adjustments) {
      const appraisal = await Appraisal.findById(adj.appraisalId);
      if (appraisal && adj.normalizedRating) {
        appraisal.normalization = {
          applied: true,
          normalizedRating: adj.normalizedRating,
          normalizedBy: req.user._id,
          normalizedDate: new Date(),
          justification: adj.justification || '',
        };
        appraisal.finalRating = adj.normalizedRating;
        await appraisal.save();
      }
    }
  }

  res.json({
    success: true,
    data: {
      currentDistribution: distribution,
      targetDistribution,
      total,
      violations: {
        5: distribution[5] > targetDistribution[5],
        4: distribution[4] > targetDistribution[4],
        2: distribution[2] > targetDistribution[2],
        1: distribution[1] > targetDistribution[1],
      },
    },
    message: 'Normalization completed',
  });
});

// @desc    Get appraisals for manager
// @route   GET /api/appraisal/manager/appraisals
// @access  Private (Manager)
exports.getManagerAppraisals = asyncHandler(async (req, res) => {
  const { cycleId, status } = req.query;

  const query = {
    tenantId: req.tenantId,
    managerId: req.user.employeeId,
  };

  if (cycleId) query.cycleId = cycleId;
  if (status) query.status = status;

  const appraisals = await Appraisal.find(query)
    .populate('employeeId', 'firstName lastName employeeCode department designation')
    .populate('cycleId', 'cycleName')
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: appraisals,
  });
});

// @desc    Get all appraisals (HR)
// @route   GET /api/appraisal
// @access  Private (HR Administrator, Tenant Admin)
exports.getAllAppraisals = asyncHandler(async (req, res) => {
  const { cycleId, status, department, page = 1, limit = 50 } = req.query;

  const query = { tenantId: req.tenantId };

  if (cycleId) query.cycleId = cycleId;
  if (status) query.status = status;

  if (department) {
    const employees = await Employee.find({ tenantId: req.tenantId, department }).select('_id');
    query.employeeId = { $in: employees.map(e => e._id) };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const appraisals = await Appraisal.find(query)
    .populate('employeeId', 'firstName lastName employeeCode department')
    .populate('cycleId', 'cycleName')
    .populate('managerId', 'firstName lastName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Appraisal.countDocuments(query);

  res.json({
    success: true,
    data: appraisals,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// @desc    Get cycles
// @route   GET /api/appraisal/cycles
// @access  Private
exports.getCycles = asyncHandler(async (req, res) => {
  const cycles = await AppraisalCycle.find({ tenantId: req.tenantId })
    .sort({ startDate: -1 })
    .lean();

  res.json({
    success: true,
    data: cycles,
  });
});
