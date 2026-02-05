const Delegation = require('../models/Delegation');
const User = require('../models/User');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { createAuditLog } = require('../utils/auditLog');
const { sendNotification } = require('../utils/notificationService');

/**
 * Create delegation
 * BRD: BR-UAM-004
 */
exports.createDelegation = asyncHandler(async (req, res) => {
  const { delegateeId, permissions, modules, startDate, endDate, reason, requiresApproval } = req.body;
  
  // Validate dates
  if (new Date(startDate) >= new Date(endDate)) {
    return res.status(400).json({
      success: false,
      message: 'End date must be after start date',
    });
  }

  // Check if delegatee exists
  const delegatee = await User.findOne({
    _id: delegateeId,
    tenantId: req.tenantId,
  });

  if (!delegatee) {
    return res.status(404).json({
      success: false,
      message: 'Delegatee user not found',
    });
  }

  // Check for overlapping delegations
  const overlapping = await Delegation.findOne({
    tenantId: req.tenantId,
    delegatorId: req.user._id,
    delegateeId,
    status: { $in: ['Pending', 'Active'] },
    $or: [
      { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
    ],
  });

  if (overlapping) {
    return res.status(400).json({
      success: false,
      message: 'Delegation already exists for this period',
    });
  }

  const delegation = await Delegation.create({
    tenantId: req.tenantId,
    delegatorId: req.user._id,
    delegateeId,
    permissions: permissions || [],
    modules: modules || ['All'],
    startDate,
    endDate,
    reason,
    requiresApproval: requiresApproval || false,
    status: requiresApproval ? 'Pending' : 'Active',
  });

  // Send notification to delegatee
  await sendNotification({
    tenantId: req.tenantId,
    recipientEmail: delegatee.email,
    recipientName: delegatee.name,
    subject: 'Delegation Assignment',
    message: `You have been delegated approval authority by ${req.user.name} from ${startDate} to ${endDate}`,
    html: `<p>Dear ${delegatee.name},</p><p>You have been delegated approval authority by ${req.user.name}.</p><p>Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}</p><p>Reason: ${reason}</p>`,
  });

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'UAM',
    entityType: 'Delegation',
    entityId: delegation._id,
    description: `Delegation created: ${req.user.name} → ${delegatee.name}`,
  });

  res.status(201).json({
    success: true,
    data: delegation,
  });
});

/**
 * Get delegations
 */
exports.getDelegations = asyncHandler(async (req, res) => {
  const { type, status } = req.query;
  const filter = { tenantId: req.tenantId };

  // Filter by delegator or delegatee
  if (type === 'delegated') {
    filter.delegatorId = req.user._id;
  } else if (type === 'received') {
    filter.delegateeId = req.user._id;
  }

  if (status) {
    filter.status = status;
  }

  const delegations = await Delegation.find(filter)
    .populate('delegatorId', 'name email role')
    .populate('delegateeId', 'name email role')
    .populate('approvedBy', 'name email')
    .populate('revokedBy', 'name email')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: delegations.length,
    data: delegations,
  });
});

/**
 * Get single delegation
 */
exports.getDelegation = asyncHandler(async (req, res) => {
  const delegation = await Delegation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('delegatorId', 'name email role')
    .populate('delegateeId', 'name email role')
    .populate('approvedBy', 'name email')
    .populate('revokedBy', 'name email');

  if (!delegation) {
    return res.status(404).json({
      success: false,
      message: 'Delegation not found',
    });
  }

  res.status(200).json({
    success: true,
    data: delegation,
  });
});

/**
 * Approve delegation (if requires approval)
 */
exports.approveDelegation = asyncHandler(async (req, res) => {
  const delegation = await Delegation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!delegation) {
    return res.status(404).json({
      success: false,
      message: 'Delegation not found',
    });
  }

  if (!delegation.requiresApproval) {
    return res.status(400).json({
      success: false,
      message: 'This delegation does not require approval',
    });
  }

  if (delegation.status !== 'Pending') {
    return res.status(400).json({
      success: false,
      message: `Delegation is already ${delegation.status}`,
    });
  }

  delegation.status = 'Active';
  delegation.approvedBy = req.user._id;
  delegation.approvedDate = Date.now();

  await delegation.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'APPROVE',
    module: 'UAM',
    entityType: 'Delegation',
    entityId: delegation._id,
    description: 'Delegation approved',
  });

  res.status(200).json({
    success: true,
    data: delegation,
  });
});

/**
 * Revoke delegation
 */
exports.revokeDelegation = asyncHandler(async (req, res) => {
  const { revocationReason } = req.body;
  
  const delegation = await Delegation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!delegation) {
    return res.status(404).json({
      success: false,
      message: 'Delegation not found',
    });
  }

  // Only delegator or admin can revoke
  if (delegation.delegatorId.toString() !== req.user._id.toString() && 
      !['Tenant Admin', 'Super Admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Only delegator or admin can revoke delegation',
    });
  }

  delegation.status = 'Revoked';
  delegation.revokedBy = req.user._id;
  delegation.revokedDate = Date.now();
  delegation.revocationReason = revocationReason;

  await delegation.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    module: 'UAM',
    entityType: 'Delegation',
    entityId: delegation._id,
    description: 'Delegation revoked',
  });

  res.status(200).json({
    success: true,
    data: delegation,
  });
});

/**
 * Update delegation
 */
exports.updateDelegation = asyncHandler(async (req, res) => {
  const { permissions, modules, startDate, endDate, reason } = req.body;
  
  const delegation = await Delegation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });

  if (!delegation) {
    return res.status(404).json({
      success: false,
      message: 'Delegation not found',
    });
  }

  // Only delegator can update
  if (delegation.delegatorId.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Only delegator can update delegation',
    });
  }

  if (permissions) delegation.permissions = permissions;
  if (modules) delegation.modules = modules;
  if (startDate) delegation.startDate = startDate;
  if (endDate) delegation.endDate = endDate;
  if (reason) delegation.reason = reason;

  await delegation.save();

  res.status(200).json({
    success: true,
    data: delegation,
  });
});
