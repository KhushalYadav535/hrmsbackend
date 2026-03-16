const Job = require('../models/Job');

// @desc    Get all jobs
// @route   GET /api/jobs
// @access  Private
exports.getJobs = async (req, res) => {
  try {
    const { status, department, postingUnitId, jobType } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status) filter.status = status;
    if (department) filter.department = department;
    if (postingUnitId) filter.postingUnitId = postingUnitId;
    if (jobType) filter.jobType = jobType;

    const jobs = await Job.find(filter)
      .populate('postingUnitId', 'unitCode unitName unitType city state')
      .populate('designation', 'name')
      .populate('grade', 'name')
      .populate('locationId', 'name city state')
      .sort({ postedDate: -1 });

    res.status(200).json({
      success: true,
      count: jobs.length,
      data: jobs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single job
// @route   GET /api/jobs/:id
// @access  Private
exports.getJob = async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found',
      });
    }

    res.status(200).json({
      success: true,
      data: job,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create job
// @route   POST /api/jobs
// @access  Private (HR Admin, Tenant Admin)
exports.createJob = async (req, res) => {
  try {
    // Validate tenantId is present
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required',
      });
    }

    // Ensure tenantId is set
    req.body.tenantId = req.tenantId;

    // Validate required fields
    const { title, department, openPositions, postingUnitId, jobType } = req.body;
    if (!title || !department || !openPositions) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, department, and openPositions',
      });
    }

    // BR-HRMS-02: Validate posting unit if provided
    if (postingUnitId) {
      const OrganizationUnit = require('../models/OrganizationUnit');
      const unit = await OrganizationUnit.findOne({
        _id: postingUnitId,
        tenantId: req.tenantId,
        isActive: true,
      });
      if (!unit) {
        return res.status(400).json({
          success: false,
          message: 'Posting unit not found or inactive',
        });
      }
      
      // Auto-link location from branch
      if (!req.body.locationId && unit.unitType === 'BRANCH') {
        const Location = require('../models/Location');
        const branchLocation = await Location.findOne({
          tenantId: req.tenantId,
          branchId: postingUnitId,
          status: 'Active',
        });
        if (branchLocation) {
          req.body.locationId = branchLocation._id;
        }
      }
    }

    // Ensure openPositions is a number and at least 1
    if (typeof openPositions !== 'number' || openPositions < 1) {
      return res.status(400).json({
        success: false,
        message: 'openPositions must be a number and at least 1',
      });
    }

    // Set default status if not provided
    if (!req.body.status) {
      req.body.status = 'Open';
    }

    const job = await Job.create(req.body);

    res.status(201).json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error('Error creating job:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message).join(', ');
      return res.status(400).json({
        success: false,
        message: messages,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update job
// @route   PUT /api/jobs/:id
// @access  Private (HR Admin, Tenant Admin)
exports.updateJob = async (req, res) => {
  try {
    let job = await Job.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found',
      });
    }

    job = await Job.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: job,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete job
// @route   DELETE /api/jobs/:id
// @access  Private (HR Admin, Tenant Admin)
exports.deleteJob = async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found',
      });
    }

    await job.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Job deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
