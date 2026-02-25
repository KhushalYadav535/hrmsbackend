const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const appraisalDisputeController = require('../controllers/appraisalDisputeController');

router.get('/', protect, appraisalDisputeController.getDisputes);
router.get('/:id', protect, appraisalDisputeController.getDispute);
router.post('/', protect, appraisalDisputeController.submitDispute);
router.put('/:id/manager-respond', protect, authorize('Manager', 'HR Administrator', 'Tenant Admin'), appraisalDisputeController.managerRespond);
router.put('/:id/escalate', protect, appraisalDisputeController.escalateToHR);
router.put('/:id/hr-review', protect, authorize('HR Administrator', 'Tenant Admin'), appraisalDisputeController.hrReview);

module.exports = router;
