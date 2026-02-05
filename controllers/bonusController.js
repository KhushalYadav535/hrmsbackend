const Bonus = require('../models/Bonus');

// @desc    Get all bonuses
// @route   GET /api/bonuses
// @access  Private
exports.getBonuses = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status) filter.status = status;

    const bonuses = await Bonus.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: bonuses.length,
      data: bonuses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single bonus
// @route   GET /api/bonuses/:id
// @access  Private
exports.getBonus = async (req, res) => {
  try {
    const bonus = await Bonus.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!bonus) {
      return res.status(404).json({
        success: false,
        message: 'Bonus not found',
      });
    }

    res.status(200).json({
      success: true,
      data: bonus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create bonus
// @route   POST /api/bonuses
// @access  Private (Payroll Admin, HR Admin, Tenant Admin)
exports.createBonus = async (req, res) => {
  try {
    req.body.tenantId = req.tenantId;
    const bonus = await Bonus.create(req.body);

    res.status(201).json({
      success: true,
      data: bonus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update bonus
// @route   PUT /api/bonuses/:id
// @access  Private (Payroll Admin, HR Admin, Tenant Admin)
exports.updateBonus = async (req, res) => {
  try {
    let bonus = await Bonus.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!bonus) {
      return res.status(404).json({
        success: false,
        message: 'Bonus not found',
      });
    }

    bonus = await Bonus.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: bonus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Process bonus
// @route   PUT /api/bonuses/:id/process
// @access  Private (Payroll Admin)
exports.processBonus = async (req, res) => {
  try {
    const bonus = await Bonus.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!bonus) {
      return res.status(404).json({
        success: false,
        message: 'Bonus not found',
      });
    }

    bonus.status = 'Processed';
    await bonus.save();

    res.status(200).json({
      success: true,
      data: bonus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Delete bonus
// @route   DELETE /api/bonuses/:id
// @access  Private (Payroll Admin, HR Admin, Tenant Admin)
exports.deleteBonus = async (req, res) => {
  try {
    const bonus = await Bonus.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!bonus) {
      return res.status(404).json({
        success: false,
        message: 'Bonus not found',
      });
    }

    await bonus.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Bonus deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
