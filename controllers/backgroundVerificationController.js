const BackgroundVerification = require('../models/BackgroundVerification');
const Onboarding = require('../models/Onboarding');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { createAuditLog } = require('../utils/auditLog');

/**
 * Initiate background verification
 * BRD: BR-ONB-003
 */
exports.initiateBackgroundVerification = asyncHandler(async (req, res) => {
  const { candidateId, agencyId, agencyName } = req.body;
  
  const onboarding = await Onboarding.findOne({
    _id: candidateId,
    tenantId: req.tenantId,
  });

  if (!onboarding) {
    return res.status(404).json({
      success: false,
      message: 'Onboarding record not found',
    });
  }

  // Check if verification already exists
  let verification = await BackgroundVerification.findOne({
    tenantId: req.tenantId,
    candidateId,
  });

  if (verification) {
    return res.status(400).json({
      success: false,
      message: 'Background verification already initiated',
    });
  }

  verification = await BackgroundVerification.create({
    tenantId: req.tenantId,
    candidateId,
    candidateName: onboarding.candidateName,
    candidateEmail: onboarding.candidateEmail,
    agencyId,
    agencyName,
    overallStatus: 'Pending',
    initiatedDate: Date.now(),
  });

  // Update onboarding status
  onboarding.status = 'Verification In Progress';
  await onboarding.save();

  // TODO: Call BGV agency API to initiate verification
  // For now, just create the record

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    entityType: 'BackgroundVerification',
    entityId: verification._id,
    description: `Background verification initiated for ${onboarding.candidateName}`,
  });

  res.status(201).json({
    success: true,
    data: verification,
    message: 'Background verification initiated successfully',
  });
});

/**
 * Update verification component status
 */
exports.updateVerificationComponent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { component, status, remarks, data } = req.body;
  
  const verification = await BackgroundVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Background verification not found',
    });
  }

  const validComponents = ['identity', 'address', 'education', 'employment', 'criminal', 'reference'];
  if (!validComponents.includes(component)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid component name',
    });
  }

  // Update component status
  verification.verificationComponents[component].status = status;
  verification.verificationComponents[component].verifiedDate = Date.now();
  verification.verificationComponents[component].remarks = remarks;

  // Update component-specific data
  if (component === 'education' && data?.institutions) {
    verification.verificationComponents.education.institutions = data.institutions;
  }
  if (component === 'employment' && data?.employers) {
    verification.verificationComponents.employment.employers = data.employers;
  }
  if (component === 'reference' && data?.references) {
    verification.verificationComponents.reference.references = data.references;
  }

  await verification.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'BackgroundVerification',
    entityId: verification._id,
    description: `${component} verification updated: ${status}`,
  });

  res.status(200).json({
    success: true,
    data: verification,
  });
});

/**
 * Add discrepancy
 */
exports.addDiscrepancy = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { component, description, severity } = req.body;
  
  const verification = await BackgroundVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Background verification not found',
    });
  }

  verification.discrepancies.push({
    component,
    description,
    severity,
    resolved: false,
  });

  await verification.save();

  res.status(200).json({
    success: true,
    data: verification,
  });
});

/**
 * Resolve discrepancy
 */
exports.resolveDiscrepancy = asyncHandler(async (req, res) => {
  const { id, discrepancyId } = req.params;
  const { resolutionNotes } = req.body;
  
  const verification = await BackgroundVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Background verification not found',
    });
  }

  const discrepancy = verification.discrepancies.id(discrepancyId);
  if (!discrepancy) {
    return res.status(404).json({
      success: false,
      message: 'Discrepancy not found',
    });
  }

  discrepancy.resolved = true;
  discrepancy.resolutionNotes = resolutionNotes;

  await verification.save();

  res.status(200).json({
    success: true,
    data: verification,
  });
});

/**
 * Approve/reject background verification
 */
exports.approveBackgroundVerification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approvalStatus, rejectionReason } = req.body;
  
  const verification = await BackgroundVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Background verification not found',
    });
  }

  verification.approvalStatus = approvalStatus;
  verification.approvedBy = req.user._id;
  verification.approvedDate = Date.now();
  
  if (approvalStatus === 'Rejected') {
    verification.rejectionReason = rejectionReason;
  }

  await verification.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'BackgroundVerification',
    entityId: verification._id,
    description: `Background verification ${approvalStatus.toLowerCase()}`,
  });

  res.status(200).json({
    success: true,
    data: verification,
  });
});

/**
 * Get background verification
 */
exports.getBackgroundVerification = asyncHandler(async (req, res) => {
  const { candidateId } = req.query;
  
  let filter = { tenantId: req.tenantId };
  if (candidateId) {
    filter.candidateId = candidateId;
  } else if (req.params.id) {
    filter._id = req.params.id;
  }

  const verification = await BackgroundVerification.findOne(filter)
    .populate('candidateId', 'candidateName candidateEmail')
    .populate('approvedBy', 'name email');

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Background verification not found',
    });
  }

  res.status(200).json({
    success: true,
    data: verification,
  });
});
