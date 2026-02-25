const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const promotionController = require('../controllers/promotionController');

router.get('/', protect, promotionController.getPromotions);
router.get('/employee/:employeeId', protect, promotionController.getEmployeePromotionHistory);
router.get('/:id', protect, promotionController.getPromotion);
router.get('/:id/letter', protect, promotionController.generatePromotionLetter);
router.post('/', protect, authorize('Tenant Admin', 'HR Administrator', 'Manager'), promotionController.createPromotion);
router.put('/:id/approve', protect, authorize('Tenant Admin'), promotionController.approvePromotion);
router.put('/:id/reject', protect, authorize('Tenant Admin', 'HR Administrator'), promotionController.rejectPromotion);

module.exports = router;
