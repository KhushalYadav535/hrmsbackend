const express = require('express');
const router = express.Router();
const {
  getOnboardings,
  getOnboarding,
  createOnboarding,
  updateOnboarding,
  updateOnboardingTask,
  completeOnboarding,
  deleteOnboarding,
} = require('../controllers/onboardingController');
const {
  createOfferLetter,
  getOfferLetter,
  acceptOfferLetter,
  generateOfferLetterPDF,
} = require('../controllers/offerLetterController');
const {
  createDocumentVerification,
  getDocumentVerification,
  verifyAadhaar,
  generateAadhaarOTP,
  verifyAadhaarWithOTP,
  verifyPAN,
  fetchDigiLockerDocuments,
  generateDigiLockerAuthUrl,
  exchangeDigiLockerCode,
  uploadDocument,
  verifyDocument,
} = require('../controllers/documentVerificationController');
const {
  initiateBackgroundVerification,
  getBackgroundVerification,
  updateVerificationComponent,
  addDiscrepancy,
  resolveDiscrepancy,
  approveBackgroundVerification,
} = require('../controllers/backgroundVerificationController');
const {
  createProbation,
  getProbations,
  getProbation,
  addProbationReview,
  confirmEmployee,
  extendProbation,
  getProbationsDueForReminder,
} = require('../controllers/probationController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

// Onboarding routes
router
  .route('/')
  .get(authorize('HR Administrator', 'Tenant Admin'), getOnboardings)
  .post(authorize('HR Administrator', 'Tenant Admin'), createOnboarding);

router.put('/:id/task/:taskId', authorize('HR Administrator', 'Tenant Admin'), updateOnboardingTask);
router.post('/:id/complete', authorize('HR Administrator', 'Tenant Admin'), completeOnboarding);

router
  .route('/:id')
  .get(authorize('HR Administrator', 'Tenant Admin'), getOnboarding)
  .put(authorize('HR Administrator', 'Tenant Admin'), updateOnboarding)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deleteOnboarding);

// Offer letter routes
router
  .route('/offer-letters')
  .post(authorize('HR Administrator', 'Tenant Admin'), createOfferLetter)
  .get(authorize('HR Administrator', 'Tenant Admin'), getOfferLetter);

router.post('/offer-letters/accept', acceptOfferLetter); // Public route for candidates
router.post('/offer-letters/:id/generate-pdf', authorize('HR Administrator', 'Tenant Admin'), generateOfferLetterPDF);
router.get('/offer-letters/:id', authorize('HR Administrator', 'Tenant Admin'), getOfferLetter);

// Document verification routes
router
  .route('/document-verification')
  .post(authorize('HR Administrator', 'Tenant Admin'), createDocumentVerification)
  .get(authorize('HR Administrator', 'Tenant Admin'), getDocumentVerification);

router.post('/document-verification/:id/verify-aadhaar', authorize('HR Administrator', 'Tenant Admin'), verifyAadhaar);
router.post('/document-verification/:id/aadhaar/generate-otp', authorize('HR Administrator', 'Tenant Admin'), generateAadhaarOTP);
router.post('/document-verification/:id/aadhaar/verify-otp', authorize('HR Administrator', 'Tenant Admin'), verifyAadhaarWithOTP);
router.post('/document-verification/:id/verify-pan', authorize('HR Administrator', 'Tenant Admin'), verifyPAN);
router.post('/document-verification/:id/digilocker/auth-url', authorize('HR Administrator', 'Tenant Admin'), generateDigiLockerAuthUrl);
router.post('/document-verification/:id/digilocker/exchange-code', authorize('HR Administrator', 'Tenant Admin'), exchangeDigiLockerCode);
router.post('/document-verification/:id/digilocker', authorize('HR Administrator', 'Tenant Admin'), fetchDigiLockerDocuments);
router.post('/document-verification/:id/upload', authorize('HR Administrator', 'Tenant Admin'), uploadDocument);
router.put('/document-verification/:id/documents/:docId/verify', authorize('HR Administrator', 'Tenant Admin'), verifyDocument);
router.get('/document-verification/:id', authorize('HR Administrator', 'Tenant Admin'), getDocumentVerification);

// Background verification routes
router
  .route('/background-verification')
  .post(authorize('HR Administrator', 'Tenant Admin'), initiateBackgroundVerification)
  .get(authorize('HR Administrator', 'Tenant Admin'), getBackgroundVerification);

router.put('/background-verification/:id/component', authorize('HR Administrator', 'Tenant Admin'), updateVerificationComponent);
router.post('/background-verification/:id/discrepancies', authorize('HR Administrator', 'Tenant Admin'), addDiscrepancy);
router.put('/background-verification/:id/discrepancies/:discrepancyId/resolve', authorize('HR Administrator', 'Tenant Admin'), resolveDiscrepancy);
router.put('/background-verification/:id/approve', authorize('HR Administrator', 'Tenant Admin'), approveBackgroundVerification);
router.get('/background-verification/:id', authorize('HR Administrator', 'Tenant Admin'), getBackgroundVerification);

// Probation routes
router
  .route('/probation')
  .post(authorize('HR Administrator', 'Tenant Admin'), createProbation)
  .get(authorize('HR Administrator', 'Tenant Admin'), getProbations);

router.get('/probation/reminders', authorize('HR Administrator', 'Tenant Admin'), getProbationsDueForReminder);
router.post('/probation/:id/reviews', authorize('HR Administrator', 'Tenant Admin', 'Manager'), addProbationReview);
router.post('/probation/:id/confirm', authorize('HR Administrator', 'Tenant Admin'), confirmEmployee);
router.post('/probation/:id/extend', authorize('HR Administrator', 'Tenant Admin'), extendProbation);
router.get('/probation/:id', authorize('HR Administrator', 'Tenant Admin'), getProbation);

module.exports = router;
