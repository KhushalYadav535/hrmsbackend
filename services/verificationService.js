/**
 * Verification Service
 * BRD Requirement: BR-ONB-004, BR-ONB-005, BR-ONB-006
 * UIDAI, PAN, and DigiLocker verification integrations
 * 
 * This service now uses real integration adapters that can be configured with credentials
 */

const UIDAIService = require('./uidaiService');
const IncomeTaxService = require('./incomeTaxService');
const DigiLockerService = require('./digiLockerService');
const Tenant = require('../models/Tenant');

/**
 * Verify Aadhaar through UIDAI API
 * BRD: BR-ONB-004
 */
async function verifyAadhaar(aadhaarNumber, name, dob, gender, tenantId = null) {
  try {
    // Get tenant-specific configuration if tenantId is provided
    let uidaiConfig = {};
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId);
      uidaiConfig = tenant?.integrations?.uidai || {};
    }

    // Initialize UIDAI service with configuration
    const uidaiService = new UIDAIService(uidaiConfig);

    // Verify Aadhaar (this will use OTP flow in production)
    // For now, we'll use direct verification if API is configured
    const result = await uidaiService.verifyAadhaar(aadhaarNumber, null, null, name, dob, gender);

    return {
      verified: result.verified,
      nameMatch: result.nameMatch,
      dobMatch: result.dobMatch,
      genderMatch: result.genderMatch,
      addressMatch: result.addressMatch,
      photoUrl: result.photoUrl,
      response: result.response,
      apiConfigured: result.apiConfigured !== false,
      message: result.message,
    };
  } catch (error) {
    console.error('UIDAI verification error:', error);
    return {
      verified: false,
      nameMatch: false,
      dobMatch: false,
      genderMatch: false,
      addressMatch: false,
      error: error.message,
      apiConfigured: false,
    };
  }
}

/**
 * Generate OTP for Aadhaar verification
 * BRD: BR-ONB-004 - OTP-based verification
 */
async function generateAadhaarOTP(aadhaarNumber, tenantId = null) {
  try {
    let uidaiConfig = {};
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId);
      uidaiConfig = tenant?.integrations?.uidai || {};
    }

    const uidaiService = new UIDAIService(uidaiConfig);
    return await uidaiService.generateOTP(aadhaarNumber);
  } catch (error) {
    console.error('UIDAI OTP generation error:', error);
    return {
      success: false,
      otpSent: false,
      error: error.message,
    };
  }
}

/**
 * Verify Aadhaar with OTP
 */
async function verifyAadhaarWithOTP(aadhaarNumber, otp, transactionId, name, dob, gender, tenantId = null) {
  try {
    let uidaiConfig = {};
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId);
      uidaiConfig = tenant?.integrations?.uidai || {};
    }

    const uidaiService = new UIDAIService(uidaiConfig);
    return await uidaiService.verifyAadhaar(aadhaarNumber, otp, transactionId, name, dob, gender);
  } catch (error) {
    console.error('UIDAI OTP verification error:', error);
    return {
      verified: false,
      error: error.message,
    };
  }
}

/**
 * Verify PAN through Income Tax API
 * BRD: BR-ONB-005
 */
async function verifyPAN(panNumber, name, dob, tenantId = null) {
  try {
    // Get tenant-specific configuration
    let incomeTaxConfig = {};
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId);
      incomeTaxConfig = tenant?.integrations?.incomeTax || {};
    }

    // Initialize Income Tax service
    const incomeTaxService = new IncomeTaxService(incomeTaxConfig);

    // Verify PAN
    const result = await incomeTaxService.verifyPAN(panNumber, name, dob);

    return {
      verified: result.verified,
      nameMatch: result.nameMatch,
      dobMatch: result.dobMatch,
      response: result.response,
      apiConfigured: result.apiConfigured !== false,
      message: result.message,
    };
  } catch (error) {
    console.error('PAN verification error:', error);
    return {
      verified: false,
      nameMatch: false,
      dobMatch: false,
      error: error.message,
      apiConfigured: false,
    };
  }
}

/**
 * Fetch documents from DigiLocker
 * BRD: BR-ONB-006
 */
async function fetchDigiLockerDocuments(aadhaarNumber, consentToken, tenantId = null) {
  try {
    // Get tenant-specific configuration
    let digiLockerConfig = {};
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId);
      digiLockerConfig = tenant?.integrations?.digiLocker || {};
    }

    // Initialize DigiLocker service
    const digiLockerService = new DigiLockerService(digiLockerConfig);

    // Fetch documents using access token (consentToken)
    const result = await digiLockerService.fetchDocuments(consentToken, aadhaarNumber);

    return {
      success: result.success,
      documents: result.documents || [],
      apiConfigured: result.apiConfigured !== false,
      message: result.message,
    };
  } catch (error) {
    console.error('DigiLocker fetch error:', error);
    return {
      success: false,
      documents: [],
      error: error.message,
      apiConfigured: false,
    };
  }
}

/**
 * Generate DigiLocker authorization URL
 */
async function generateDigiLockerAuthUrl(state, tenantId = null) {
  try {
    let digiLockerConfig = {};
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId);
      digiLockerConfig = tenant?.integrations?.digiLocker || {};
    }

    const digiLockerService = new DigiLockerService(digiLockerConfig);
    return {
      success: true,
      authUrl: digiLockerService.generateAuthUrl(state),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Exchange DigiLocker authorization code for token
 */
async function exchangeDigiLockerCode(code, tenantId = null) {
  try {
    let digiLockerConfig = {};
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId);
      digiLockerConfig = tenant?.integrations?.digiLocker || {};
    }

    const digiLockerService = new DigiLockerService(digiLockerConfig);
    return await digiLockerService.exchangeCodeForToken(code);
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Extract data from document using OCR
 */
async function extractDocumentData(documentUrl, documentType) {
  try {
    // TODO: Integrate with OCR service (Google Vision API, AWS Textract, etc.)
    // For now, return mock response
    
    // Mock OCR implementation
    return {
      success: true,
      extractedData: {
        name: 'Extracted Name',
        dob: '1990-01-01',
        documentNumber: '123456789012',
        // ... other extracted fields
      },
    };
  } catch (error) {
    console.error('OCR extraction error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  verifyAadhaar,
  generateAadhaarOTP,
  verifyAadhaarWithOTP,
  verifyPAN,
  fetchDigiLockerDocuments,
  generateDigiLockerAuthUrl,
  exchangeDigiLockerCode,
  extractDocumentData,
};
