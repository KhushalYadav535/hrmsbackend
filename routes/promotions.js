const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const promotionController = require('../controllers/promotionController');

// All routes require authentication and tenant context
router.use(protect);
router.use(setTenant);

router.get('/', promotionController.getPromotions);
router.get('/employee/:employeeId', promotionController.getEmployeePromotionHistory);
router.get('/:id', promotionController.getPromotion);
router.get('/:id/letter', promotionController.generatePromotionLetter);
router.post('/', authorize('Tenant Admin', 'HR Administrator', 'Manager'), promotionController.createPromotion);
router.put('/:id/approve', authorize('Tenant Admin'), promotionController.approvePromotion);
router.put('/:id/reject', authorize('Tenant Admin', 'HR Administrator'), promotionController.rejectPromotion);

module.exports = router;
