const DocumentVerification = require('../models/DocumentVerification');
const Onboarding = require('../models/Onboarding');
const { 
  verifyAadhaar, 
  generateAadhaarOTP, 
  verifyAadhaarWithOTP,
  verifyPAN, 
  fetchDigiLockerDocuments, 
  generateDigiLockerAuthUrl,
  exchangeDigiLockerCode,
  extractDocumentData 
} = require('../services/verificationService');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { createAuditLog } = require('../utils/auditLog');

/**
 * Create document verification record
 * BRD: BR-ONB-004, BR-ONB-005, BR-ONB-006
 */
exports.createDocumentVerification = asyncHandler(async (req, res) => {
  const { candidateId, aadhaar, pan } = req.body;
  
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
  let verification = await DocumentVerification.findOne({
    tenantId: req.tenantId,
    candidateId,
  });

  if (verification) {
    return res.status(400).json({
      success: false,
      message: 'Document verification already exists',
    });
  }

  verification = await DocumentVerification.create({
    tenantId: req.tenantId,
    candidateId,
    candidateName: onboarding.candidateName,
    candidateEmail: onboarding.candidateEmail,
    aadhaar: {
      number: aadhaar?.number || '',
      status: 'Pending',
    },
    pan: {
      number: pan?.number || '',
      status: 'Pending',
    },
  });

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'CREATE',
    entityType: 'DocumentVerification',
    entityId: verification._id,
    description: `Document verification created for ${onboarding.candidateName}`,
  });

  res.status(201).json({
    success: true,
    data: verification,
  });
});

/**
 * Verify Aadhaar
 * BRD: BR-ONB-004
 */
exports.verifyAadhaar = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, dob, gender } = req.body;
  
  const verification = await DocumentVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Document verification not found',
    });
  }

  // Call UIDAI verification service
  const result = await verifyAadhaar(
    verification.aadhaar.number,
    name,
    dob,
    gender
  );

  // Update verification status
  verification.aadhaar.status = result.verified ? 'Verified' : 'Failed';
  verification.aadhaar.verifiedDate = Date.now();
  verification.aadhaar.verificationMethod = 'UIDAI API';
  verification.aadhaar.nameMatch = result.nameMatch;
  verification.aadhaar.dobMatch = result.dobMatch;
  verification.aadhaar.genderMatch = result.genderMatch;
  verification.aadhaar.addressMatch = result.addressMatch;
  verification.aadhaar.photoUrl = result.photoUrl;
  verification.aadhaar.uidaiResponse = result.response;

  if (!result.verified) {
    verification.aadhaar.remarks = result.error || 'Verification failed';
  }

  await verification.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'DocumentVerification',
    entityId: verification._id,
    description: `Aadhaar verification ${result.verified ? 'successful' : 'failed'}`,
  });

  res.status(200).json({
    success: true,
    data: verification,
    verificationResult: result,
  });
});

/**
 * Verify PAN
 * BRD: BR-ONB-005
 */
exports.verifyPAN = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, dob } = req.body;
  
  const verification = await DocumentVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Document verification not found',
    });
  }

  // Call Income Tax API verification service with tenantId
  const result = await verifyPAN(
    verification.pan.number,
    name,
    dob,
    req.tenantId
  );

  // Update verification status
  verification.pan.status = result.verified ? 'Verified' : 'Failed';
  verification.pan.verifiedDate = Date.now();
  verification.pan.verificationMethod = 'Income Tax API';
  verification.pan.nameMatch = result.nameMatch;
  verification.pan.dobMatch = result.dobMatch;
  verification.pan.itResponse = result.response;

  if (!result.verified) {
    verification.pan.remarks = result.error || 'Verification failed';
  }

  await verification.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'DocumentVerification',
    entityId: verification._id,
    description: `PAN verification ${result.verified ? 'successful' : 'failed'}`,
  });

  res.status(200).json({
    success: true,
    data: verification,
    verificationResult: result,
  });
});

/**
 * Fetch documents from DigiLocker
 * BRD: BR-ONB-006
 */
exports.fetchDigiLockerDocuments = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { consentToken, aadhaarNumber } = req.body;
  
  const verification = await DocumentVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Document verification not found',
    });
  }

  // Fetch documents from DigiLocker
  const result = await fetchDigiLockerDocuments(
    aadhaarNumber || verification.aadhaar.number,
    consentToken
  );

  if (result.success) {
    verification.digiLocker.enabled = true;
    verification.digiLocker.consentGiven = true;
    verification.digiLocker.consentDate = Date.now();
    verification.digiLocker.documentsFetched = result.documents;

    await verification.save();
  }

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'DocumentVerification',
    entityId: verification._id,
    description: 'DigiLocker documents fetched',
  });

  res.status(200).json({
    success: result.success,
    data: verification,
    documents: result.documents,
  });
});

/**
 * Upload and verify document
 */
exports.uploadDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, name, url } = req.body;
  
  const verification = await DocumentVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Document verification not found',
    });
  }

  // Extract data using OCR if needed
  let ocrData = null;
  if (url && type !== 'Photo') {
    const ocrResult = await extractDocumentData(url, type);
    if (ocrResult.success) {
      ocrData = ocrResult.extractedData;
    }
  }

  verification.documents.push({
    type,
    name,
    url,
    uploadedDate: Date.now(),
    verified: false,
    ocrData,
  });

  await verification.save();

  res.status(200).json({
    success: true,
    data: verification,
  });
});

/**
 * Verify uploaded document
 */
exports.verifyDocument = asyncHandler(async (req, res) => {
  const { id, docId } = req.params;
  const { verified, remarks } = req.body;
  
  const verification = await DocumentVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Document verification not found',
    });
  }

  const document = verification.documents.id(docId);
  if (!document) {
    return res.status(404).json({
      success: false,
      message: 'Document not found',
    });
  }

  document.verified = verified !== undefined ? verified : true;
  document.verifiedDate = Date.now();
  document.verifiedBy = req.user._id;
  document.remarks = remarks;

  await verification.save();

  res.status(200).json({
    success: true,
    data: verification,
  });
});

/**
 * Generate OTP for Aadhaar verification
 * BRD: BR-ONB-004 - OTP-based verification
 */
exports.generateAadhaarOTP = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const verification = await DocumentVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Document verification not found',
    });
  }

  if (!verification.aadhaar.number) {
    return res.status(400).json({
      success: false,
      message: 'Aadhaar number not provided',
    });
  }

  // Generate OTP via UIDAI service
  const result = await generateAadhaarOTP(
    verification.aadhaar.number,
    req.tenantId
  );

  if (result.success) {
    // Store transaction ID temporarily (in production, store in session/redis)
    verification.aadhaar.otpTransactionId = result.transactionId;
    verification.aadhaar.otpExpiryTime = Date.now() + (result.expiryTime * 1000);
    await verification.save();
  }

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'DocumentVerification',
    entityId: verification._id,
    description: `Aadhaar OTP ${result.success ? 'generated' : 'generation failed'}`,
  });

  res.status(200).json({
    success: result.success,
    otpSent: result.otpSent,
    transactionId: result.transactionId,
    expiryTime: result.expiryTime,
    message: result.message,
    apiConfigured: result.apiConfigured !== false,
  });
});

/**
 * Verify Aadhaar with OTP
 * BRD: BR-ONB-004 - OTP-based verification
 */
exports.verifyAadhaarWithOTP = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { otp, name, dob, gender } = req.body;
  
  const verification = await DocumentVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Document verification not found',
    });
  }

  if (!verification.aadhaar.otpTransactionId) {
    return res.status(400).json({
      success: false,
      message: 'OTP not generated. Please generate OTP first.',
    });
  }

  // Check OTP expiry
  if (verification.aadhaar.otpExpiryTime && Date.now() > verification.aadhaar.otpExpiryTime) {
    return res.status(400).json({
      success: false,
      message: 'OTP has expired. Please generate a new OTP.',
    });
  }

  // Verify Aadhaar with OTP via UIDAI service
  const result = await verifyAadhaarWithOTP(
    verification.aadhaar.number,
    otp,
    verification.aadhaar.otpTransactionId,
    name,
    dob,
    gender,
    req.tenantId
  );

  // Update verification status
  verification.aadhaar.status = result.verified ? 'Verified' : 'Failed';
  verification.aadhaar.verifiedDate = Date.now();
  verification.aadhaar.verificationMethod = 'UIDAI API (OTP)';
  verification.aadhaar.nameMatch = result.nameMatch;
  verification.aadhaar.dobMatch = result.dobMatch;
  verification.aadhaar.genderMatch = result.genderMatch;
  verification.aadhaar.addressMatch = result.addressMatch;
  verification.aadhaar.photoUrl = result.photoUrl;
  verification.aadhaar.uidaiResponse = result.response;
  
  // Clear OTP transaction data
  verification.aadhaar.otpTransactionId = undefined;
  verification.aadhaar.otpExpiryTime = undefined;

  if (!result.verified) {
    verification.aadhaar.remarks = result.message || 'Verification failed';
  }

  await verification.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'DocumentVerification',
    entityId: verification._id,
    description: `Aadhaar OTP verification ${result.verified ? 'successful' : 'failed'}`,
  });

  res.status(200).json({
    success: true,
    data: verification,
    verificationResult: result,
  });
});

/**
 * Generate DigiLocker authorization URL
 * BRD: BR-ONB-006 - OAuth-based document access
 */
exports.generateDigiLockerAuthUrl = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const verification = await DocumentVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Document verification not found',
    });
  }

  // Generate state token (in production, use crypto.randomBytes)
  const state = `${verification._id}_${Date.now()}`;

  // Generate authorization URL
  const result = await generateDigiLockerAuthUrl(state, req.tenantId);

  if (result.success) {
    // Store state for verification later
    verification.digiLocker.authState = state;
    await verification.save();
  }

  res.status(200).json({
    success: result.success,
    authUrl: result.authUrl,
    state: state,
    message: result.success ? 'Authorization URL generated' : result.error,
  });
});

/**
 * Exchange DigiLocker authorization code for access token
 * BRD: BR-ONB-006 - OAuth token exchange
 */
exports.exchangeDigiLockerCode = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { code, state } = req.body;
  
  const verification = await DocumentVerification.findOne({
    _id: id,
    tenantId: req.tenantId,
  });

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Document verification not found',
    });
  }

  // Verify state token
  if (verification.digiLocker.authState !== state) {
    return res.status(400).json({
      success: false,
      message: 'Invalid state token',
    });
  }

  // Exchange code for access token
  const result = await exchangeDigiLockerCode(code, req.tenantId);

  if (result.success) {
    // Store access token securely (in production, encrypt before storing)
    verification.digiLocker.accessToken = result.accessToken;
    verification.digiLocker.refreshToken = result.refreshToken;
    verification.digiLocker.tokenExpiry = Date.now() + (result.expiresIn * 1000);
    verification.digiLocker.enabled = true;
    verification.digiLocker.consentGiven = true;
    verification.digiLocker.consentDate = Date.now();
    
    // Clear auth state
    verification.digiLocker.authState = undefined;
    
    await verification.save();
  }

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'UPDATE',
    entityType: 'DocumentVerification',
    entityId: verification._id,
    description: `DigiLocker OAuth ${result.success ? 'completed' : 'failed'}`,
  });

  res.status(200).json({
    success: result.success,
    data: verification,
    message: result.success ? 'DigiLocker access granted' : result.error,
  });
});

/**
 * Get document verification
 */
exports.getDocumentVerification = asyncHandler(async (req, res) => {
  const { candidateId } = req.query;
  
  let filter = { tenantId: req.tenantId };
  if (candidateId) {
    filter.candidateId = candidateId;
  } else if (req.params.id) {
    filter._id = req.params.id;
  }

  const verification = await DocumentVerification.findOne(filter)
    .populate('candidateId', 'candidateName candidateEmail')
    .populate('verifiedBy', 'name email');

  if (!verification) {
    return res.status(404).json({
      success: false,
      message: 'Document verification not found',
    });
  }

  res.status(200).json({
    success: true,
    data: verification,
  });
});
