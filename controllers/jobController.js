const Job = require('../models/Job');

// @desc    Get all jobs
// @route   GET /api/jobs
// @access  Private
exports.getJobs = async (req, res) => {
  try {
    const { status, department } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status) filter.status = status;
    if (department) filter.department = department;

    const jobs = await Job.find(filter).sort({ postedDate: -1 });

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
    const { title, department, openPositions } = req.body;
    if (!title || !department || !openPositions) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, department, and openPositions',
      });
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
