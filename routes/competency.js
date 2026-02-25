const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const competencyController = require('../controllers/competencyController');

router.get('/', protect, competencyController.getAllCompetencies);
router.get('/:id', protect, competencyController.getCompetency);
router.post('/seed/defaults', protect, authorize('Tenant Admin', 'HR Administrator'), competencyController.seedDefaultCompetencies);
router.post('/', protect, authorize('Tenant Admin', 'HR Administrator'), competencyController.createCompetency);
router.put('/:id', protect, authorize('Tenant Admin', 'HR Administrator'), competencyController.updateCompetency);
router.delete('/:id', protect, authorize('Tenant Admin', 'HR Administrator'), competencyController.deleteCompetency);

module.exports = router;
