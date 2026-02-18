const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const {
  getSalaryStructures,
  getSalaryStructure,
  createSalaryStructure,
  updateSalaryStructure,
  deleteSalaryStructure,
} = require('../controllers/salaryStructureController');

router.use(protect);
router.use(setTenant);

router
  .route('/')
  .get(authorize('Payroll Administrator', 'Tenant Admin', 'Super Admin'), getSalaryStructures)
  .post(authorize('Payroll Administrator', 'Tenant Admin', 'Super Admin'), createSalaryStructure);

router
  .route('/:id')
  .get(authorize('Payroll Administrator', 'Tenant Admin', 'Super Admin'), getSalaryStructure)
  .put(authorize('Payroll Administrator', 'Tenant Admin', 'Super Admin'), updateSalaryStructure)
  .delete(authorize('Payroll Administrator', 'Tenant Admin', 'Super Admin'), deleteSalaryStructure);

module.exports = router;
