const AccessCertification = require('../models/AccessCertification');
const User = require('../models/User');
const Employee = require('../models/Employee');
const RolePermission = require('../models/RolePermission');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { createAuditLog } = require('../utils/auditLog');
const { sendNotification } = require('../utils/notificationService');

/**
 * Create access certification campaign
 * BRD: BR-UAM-006
 */
exports.createCertificationCampaign = asyncHandler(async (req, res) => {
  const { campaignName, campaignType, startDate, endDate, deadline, certifierId } = req.body;
  
  const certifier = await User.findOne({
    _id: certifierId,
    tenantId: req.tenantId,
  });

  if (!certifier) {
    return res.status(404).json({
      success: false,
      message: 'Certifier user not found',
    });
  }

  // Get team members (direct reports) for this certifier
  // Assuming manager relationship exists in Employee model
  const employees = await Employee.find({
    tenantId: req.tenantId,
    reportingManager: certifierId, // Or however manager relationship is stored
  });

  // Get users for these employees
  const userIds = employees.map(emp => emp.userId).filter(Boolean);
  const users = await User.find({
    tenantId: req.tenantId,
    _id: { $in: userIds },
  });

  // Get role permissions for each user
  const certifications = await Promise.all(users.map(async (user) => {
    const rolePermission = await RolePermission.findOne({
      tenantId: req.tenantId,
      role: user.role,
    });

    return {
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      roles: [user.role],
      permissions: rolePermission?.permissions || [],
      status: 'Pending',
    };
  }));

  const campaign = await AccessCertification.create({
    tenantId: req.tenantId,
    campaignName,
    campaignType,
    startDate,
    endDate,
    deadline,
    certifierId,
    certifications,
    status: 'Active',
  });

  // Send notification to certifier
  await sendNotification({
    tenantId: req.tenantId,
    recipientEmail: certifier.email,
    recipientName: certifier.name,
    subject: 'Access Certification Campaign Created',
    message: `Access certification campaign "${campaignName}" has been created. Please review and certify team member access.`,
    html: `<p>Dear ${certifier.name},</p><p>Access certification campaign "${campaignName}" has been created.</p><p>Deadline: ${new Date(deadline).toLocaleDateString()}</p><p>Please review and certify team member access.</p>`,
  });

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    module: 'UAM',
    entityType: 'AccessCertification',
    entityId: campaign._id,
    description: `Access certification campaign created: ${campaignName}`,
  });

  res.status(201).json({
    success: true,
    data: campaign,
  });
});

/**
 * Certify user access
 */
exports.certifyUserAccess = asyncHandler(async (req, res) => {
  const { campaignId, userId, status, comments, changesRequested } = req.body;
  
  const campaign = await AccessCertification.findOne({
    _id: campaignId,
    tenantId: req.tenantId,
    certifierId: req.user._id,
  });

  if (!campaign) {
    return res.status(404).json({
      success: false,
      message: 'Certification campaign not found or you are not authorized',
    });
  }

  const certification = campaign.certifications.find(c => c.userId.toString() === userId);
  if (!certification) {
    return res.status(404).json({
      success: false,
      message: 'User not found in certification list',
    });
  }

  certification.status = status;
  certification.comments = comments;
  if (status === 'Certified') {
    certification.certifiedDate = Date.now();
  }
  if (changesRequested) {
    certification.changesRequested = changesRequested;
  }

  await campaign.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    module: 'UAM',
    entityType: 'AccessCertification',
    entityId: campaign._id,
    description: `User access ${status.toLowerCase()}: ${certification.userName}`,
  });

  res.status(200).json({
    success: true,
    data: campaign,
  });
});

/**
 * Bulk certify (certify all unchanged)
 */
exports.bulkCertify = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  
  const campaign = await AccessCertification.findOne({
    _id: campaignId,
    tenantId: req.tenantId,
    certifierId: req.user._id,
  });

  if (!campaign) {
    return res.status(404).json({
      success: false,
      message: 'Certification campaign not found',
    });
  }

  // Certify all pending certifications
  campaign.certifications.forEach(cert => {
    if (cert.status === 'Pending') {
      cert.status = 'Certified';
      cert.certifiedDate = Date.now();
    }
  });

  await campaign.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    module: 'UAM',
    entityType: 'AccessCertification',
    description: 'Bulk certification completed',
  });

  res.status(200).json({
    success: true,
    data: campaign,
  });
});

/**
 * Get certification campaigns
 */
exports.getCertificationCampaigns = asyncHandler(async (req, res) => {
  const { status, certifierId } = req.query;
  const filter = { tenantId: req.tenantId };

  if (status) filter.status = status;
  if (certifierId) {
    filter.certifierId = certifierId;
  } else if (req.user.role !== 'Tenant Admin' && req.user.role !== 'Super Admin') {
    // Non-admins can only see their own campaigns
    filter.certifierId = req.user._id;
  }

  const campaigns = await AccessCertification.find(filter)
    .populate('certifierId', 'name email role')
    .populate('certifications.userId', 'name email role')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: campaigns.length,
    data: campaigns,
  });
});

/**
 * Get single certification campaign
 */
exports.getCertificationCampaign = asyncHandler(async (req, res) => {
  const campaign = await AccessCertification.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate('certifierId', 'name email role')
    .populate('certifications.userId', 'name email role');

  if (!campaign) {
    return res.status(404).json({
      success: false,
      message: 'Certification campaign not found',
    });
  }

  res.status(200).json({
    success: true,
    data: campaign,
  });
});

/**
 * Get campaigns due for reminder
 */
exports.getCampaignsDueForReminder = asyncHandler(async (req, res) => {
  const { daysBefore } = req.query;
  const days = parseInt(daysBefore) || 7;
  
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + days);

  const campaigns = await AccessCertification.find({
    tenantId: req.tenantId,
    status: { $in: ['Active', 'In Progress'] },
    deadline: { $lte: targetDate, $gte: new Date() },
  })
    .populate('certifierId', 'name email')
    .populate('certifications.userId', 'name email');

  res.status(200).json({
    success: true,
    count: campaigns.length,
    data: campaigns,
  });
});
