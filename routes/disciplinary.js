const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const disciplinaryController = require('../controllers/disciplinaryController');

router.get('/', protect, disciplinaryController.getDisciplinaryRecords);
router.get('/summary/:employeeId', protect, authorize('Tenant Admin', 'HR Administrator'), disciplinaryController.getEmployeeDisciplinarySummary);
router.get('/:id', protect, disciplinaryController.getDisciplinaryRecord);
router.post('/', protect, authorize('Tenant Admin', 'HR Administrator', 'Manager'), disciplinaryController.createDisciplinaryRecord);
router.put('/:id/response', protect, disciplinaryController.submitEmployeeResponse);
router.put('/:id/outcome', protect, authorize('Tenant Admin', 'HR Administrator'), disciplinaryController.updateDisciplinaryOutcome);

module.exports = router;
