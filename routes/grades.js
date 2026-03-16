const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getGrades,
  getActiveGrades,
  getGrade,
  createGrade,
  updateGrade,
  deleteGrade,
} = require('../controllers/gradeController');

// All routes require authentication
router.use(protect);

// GET /api/grades/active — Active grades for dropdown (all authenticated users)
router.get('/active', getActiveGrades);

// GET /api/grades — All grades
router.get('/', getGrades);

// GET /api/grades/:id — Single grade
router.get('/:id', getGrade);

// POST /api/grades — Create grade (HR Admin, Tenant Admin)
router.post('/', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), createGrade);

// PUT /api/grades/:id — Update grade
router.put('/:id', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), updateGrade);

// DELETE /api/grades/:id — Archive grade
router.delete('/:id', authorize('HR Administrator', 'Tenant Admin', 'Super Admin'), deleteGrade);

module.exports = router;
