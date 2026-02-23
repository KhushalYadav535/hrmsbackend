const express = require('express');
const router = express.Router();
const {
  getCourses,
  createCourse,
  assignTraining,
  getMyTrainings,
  updateProgress,
  getTrainingCalendar,
  createTrainingCalendar,
  getCertificates,
} = require('../controllers/lmsController');
const { protect, authorize } = require('../middleware/auth');
const { setTenant } = require('../middleware/tenant');
const { requireModule } = require('../middleware/modulePermission');

router.use(protect);
router.use(setTenant);
router.use(requireModule('LMS')); // BRD: DM-037 - Module access protection

router.get('/courses', getCourses);
router.post('/courses', authorize('HR Administrator', 'Tenant Admin'), createCourse);
router.post('/assign', authorize('HR Administrator', 'Tenant Admin', 'Manager'), assignTraining);
router.get('/my-trainings', authorize('Employee'), getMyTrainings);
router.patch('/assignments/:id/progress', updateProgress);
router.get('/calendar', getTrainingCalendar);
router.post('/calendar', authorize('HR Administrator', 'Tenant Admin'), createTrainingCalendar);
router.get('/certificates', getCertificates);

module.exports = router;
