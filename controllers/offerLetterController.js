const OfferLetter = require('../models/OfferLetter');
const Onboarding = require('../models/Onboarding');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { createAuditLog } = require('../utils/auditLog');
const { sendNotification } = require('../utils/notificationService');

/**
 * Create offer letter
 * BRD: BR-ONB-002, BR-ONB-003
 */
exports.createOfferLetter = asyncHandler(async (req, res) => {
  const { candidateId, ...offerData } = req.body;
  
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

  // Check if offer letter already exists
  const existingOffer = await OfferLetter.findOne({
    tenantId: req.tenantId,
    candidateId,
  });

  if (existingOffer) {
    return res.status(400).json({
      success: false,
      message: 'Offer letter already exists for this candidate',
    });
  }

  const offerLetter = await OfferLetter.create({
    tenantId: req.tenantId,
    candidateId,
    candidateName: onboarding.candidateName,
    candidateEmail: onboarding.candidateEmail,
    position: onboarding.position,
    department: onboarding.department,
    ...offerData,
    signedBy: req.user._id,
    signedDate: Date.now(),
  });

  // Update onboarding status
  onboarding.status = 'Offer Sent';
  await onboarding.save();

  // Send notification email
  await sendNotification({
    tenantId: req.tenantId,
    recipientEmail: onboarding.candidateEmail,
    recipientName: onboarding.candidateName,
    subject: 'Offer Letter from Indian Bank',
    message: `Dear ${onboarding.candidateName}, Your offer letter has been sent. Please check your email.`,
    html: `<p>Dear ${onboarding.candidateName},</p><p>Your offer letter has been sent. Please check your email to accept the offer.</p>`,
  });

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    entityType: 'OfferLetter',
    entityId: offerLetter._id,
    description: `Offer letter created for ${onboarding.candidateName}`,
  });

  res.status(201).json({
    success: true,
    data: offerLetter,
  });
});

/**
 * Get offer letter
 */
exports.getOfferLetter = asyncHandler(async (req, res) => {
  const { candidateId } = req.query;
  
  let filter = { tenantId: req.tenantId };
  if (candidateId) {
    filter.candidateId = candidateId;
  } else if (req.params.id) {
    filter._id = req.params.id;
  }

  const offerLetter = await OfferLetter.findOne(filter)
    .populate('candidateId', 'candidateName candidateEmail')
    .populate('signedBy', 'name email');

  if (!offerLetter) {
    return res.status(404).json({
      success: false,
      message: 'Offer letter not found',
    });
  }

  res.status(200).json({
    success: true,
    data: offerLetter,
  });
});

/**
 * Accept offer letter (via portal token)
 * BRD: BR-ONB-002
 */
exports.acceptOfferLetter = asyncHandler(async (req, res) => {
  const { token, signature } = req.body;
  
  // Find onboarding by portal token
  const onboarding = await Onboarding.findOne({
    portalToken: token,
    tenantId: req.tenantId,
  });

  if (!onboarding) {
    return res.status(404).json({
      success: false,
      message: 'Invalid token or onboarding record not found',
    });
  }

  const offerLetter = await OfferLetter.findOne({
    tenantId: req.tenantId,
    candidateId: onboarding._id,
  });

  if (!offerLetter) {
    return res.status(404).json({
      success: false,
      message: 'Offer letter not found',
    });
  }

  if (offerLetter.status !== 'Sent') {
    return res.status(400).json({
      success: false,
      message: `Offer letter cannot be accepted. Current status: ${offerLetter.status}`,
    });
  }

  // Check if expired
  if (offerLetter.validityDate < new Date()) {
    offerLetter.status = 'Expired';
    await offerLetter.save();
    return res.status(400).json({
      success: false,
      message: 'Offer letter has expired',
    });
  }

  // Accept offer
  offerLetter.status = 'Accepted';
  offerLetter.acceptedDate = Date.now();
  offerLetter.acceptanceIp = req.ip;
  offerLetter.acceptanceSignature = signature;

  // Update onboarding status
  onboarding.status = 'Offer Accepted';
  await onboarding.save();

  await offerLetter.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user?._id,
    action: 'UPDATE',
    entityType: 'OfferLetter',
    entityId: offerLetter._id,
    description: `Offer letter accepted by ${onboarding.candidateName}`,
  });

  res.status(200).json({
    success: true,
    data: offerLetter,
    message: 'Offer letter accepted successfully',
  });
});

/**
 * Generate offer letter PDF
 */
exports.generateOfferLetterPDF = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const offerLetter = await OfferLetter.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!offerLetter) {
    return res.status(404).json({
      success: false,
      message: 'Offer letter not found',
    });
  }

  // TODO: Generate PDF using PDF library (pdfkit, puppeteer, etc.)
  // For now, return mock URL
  const pdfUrl = `/uploads/offer-letters/${offerLetter._id}.pdf`;
  
  offerLetter.pdfUrl = pdfUrl;
  await offerLetter.save();

  res.status(200).json({
    success: true,
    data: {
      pdfUrl,
      message: 'PDF generated successfully',
    },
  });
});
