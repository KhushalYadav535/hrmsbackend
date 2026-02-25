const TravelPolicy = require('../models/TravelPolicy');
const AuditLog = require('../models/AuditLog');

/**
 * Get all travel policies
 * BRD Requirement: BR-TRV-002
 */
exports.getTravelPolicies = async (req, res) => {
  try {
    const { grade, status } = req.query;
    const filter = { tenantId: req.tenantId };

    if (grade) filter.grade = grade;
    if (status) filter.status = status;

    const policies = await TravelPolicy.find(filter).sort({ grade: 1 });

    res.status(200).json({
      success: true,
      count: policies.length,
      data: policies,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Create travel policy
 */
exports.createTravelPolicy = async (req, res) => {
  try {
    const { grade } = req.body;

    if (!grade) {
      return res.status(400).json({
        success: false,
        message: 'Grade is required',
      });
    }

    // Check for duplicate
    const existing = await TravelPolicy.findOne({
      tenantId: req.tenantId,
      grade,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Travel policy for grade ${grade} already exists`,
      });
    }

    const policy = await TravelPolicy.create({
      ...req.body,
      tenantId: req.tenantId,
    });

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'Create',
      module: 'TRV',
      entityType: 'TravelPolicy',
      entityId: policy._id,
      description: `Created travel policy for grade ${grade}`,
      changes: JSON.stringify({ created: req.body }),
    });

    res.status(201).json({
      success: true,
      data: policy,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Update travel policy
 */
exports.updateTravelPolicy = async (req, res) => {
  try {
    const policy = await TravelPolicy.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Travel policy not found',
      });
    }

    Object.assign(policy, req.body);
    await policy.save();

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'Update',
      module: 'TRV',
      entityType: 'TravelPolicy',
      entityId: policy._id,
      description: `Updated travel policy for grade ${policy.grade}`,
      changes: JSON.stringify({ updated: req.body }),
    });

    res.status(200).json({
      success: true,
      data: policy,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Delete travel policy
 */
exports.deleteTravelPolicy = async (req, res) => {
  try {
    const policy = await TravelPolicy.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Travel policy not found',
      });
    }

    await policy.deleteOne();

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'Delete',
      module: 'TRV',
      entityType: 'TravelPolicy',
      entityId: req.params.id,
      description: `Deleted travel policy for grade ${policy.grade}`,
      changes: JSON.stringify({ deleted: policy.toObject() }),
    });

    res.status(200).json({
      success: true,
      message: 'Travel policy deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
