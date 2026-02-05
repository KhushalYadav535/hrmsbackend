const express = require('express');
const router = express.Router();
const {
  getDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = require('../controllers/departmentController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');

router.use(protect);
router.use(setTenant);

router
  .route('/')
  .get(getDepartments)
  .post(authorize('HR Administrator', 'Tenant Admin'), createDepartment);

router
  .route('/:id')
  .get(getDepartment)
  .put(authorize('HR Administrator', 'Tenant Admin'), updateDepartment)
  .delete(authorize('HR Administrator', 'Tenant Admin'), deleteDepartment);

module.exports = router;
