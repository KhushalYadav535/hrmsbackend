const Location = require('../models/Location');

// @desc    Get all locations for tenant
// @route   GET /api/locations
// @access  Private
exports.getLocations = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { tenantId: req.tenantId };

    // BR-C1-06: Default to showing only Active locations for dropdown
    if (status) {
      filter.status = status;
    }

    const locations = await Location.find(filter).sort({ state: 1, name: 1 });

    res.status(200).json({
      success: true,
      count: locations.length,
      data: locations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get active locations for dropdown (only Active status)
// @route   GET /api/locations/active
// @access  Private
exports.getActiveLocations = async (req, res) => {
  try {
    const locations = await Location.find({
      tenantId: req.tenantId,
      status: 'Active',
    }).sort({ state: 1, name: 1 }).select('name code state city');

    res.status(200).json({
      success: true,
      count: locations.length,
      data: locations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single location
// @route   GET /api/locations/:id
// @access  Private
exports.getLocation = async (req, res) => {
  try {
    const location = await Location.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    res.status(200).json({
      success: true,
      data: location,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create location
// @route   POST /api/locations
// @access  Private (HR Admin, Tenant Admin)
exports.createLocation = async (req, res) => {
  try {
    req.body.tenantId = req.tenantId;

    const { name, code } = req.body;
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name and code',
      });
    }

    // Check duplicate code within tenant
    const existing = await Location.findOne({
      tenantId: req.tenantId,
      code: code.toUpperCase().trim(),
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Location with code "${code}" already exists`,
      });
    }

    const location = await Location.create(req.body);

    res.status(201).json({
      success: true,
      data: location,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Location with this code already exists for this tenant',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update location
// @route   PUT /api/locations/:id
// @access  Private (HR Admin, Tenant Admin)
exports.updateLocation = async (req, res) => {
  try {
    let location = await Location.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    location = await Location.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: location,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete location (soft-archive)
// @route   DELETE /api/locations/:id
// @access  Private (HR Admin, Tenant Admin)
exports.deleteLocation = async (req, res) => {
  try {
    const location = await Location.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    // BR-C1-09: Archive instead of delete if referenced by employees
    location.status = 'Archived';
    await location.save();

    res.status(200).json({
      success: true,
      message: 'Location archived successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
