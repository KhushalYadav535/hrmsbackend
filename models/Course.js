const mongoose = require('mongoose');

/**
 * Course Model - LMS
 * BRD: BR-P1-005 - Learning Management System
 */
const courseSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  courseCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  courseName: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  category: {
    type: String,
    enum: ['TECHNICAL', 'SOFT_SKILLS', 'LEADERSHIP', 'COMPLIANCE', 'DOMAIN', 'CERTIFICATION', 'OTHER'],
    required: true,
  },
  courseType: {
    type: String,
    enum: ['INTERNAL', 'EXTERNAL', 'E_LEARNING', 'BLENDED'],
    required: true,
  },
  duration: {
    type: Number,
    required: true,
    comment: 'Duration in hours',
  },
  mode: {
    type: String,
    enum: ['CLASSROOM', 'ONLINE', 'BLENDED', 'SELF_PACED'],
    required: true,
  },
  instructor: {
    name: String,
    email: String,
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    external: {
      type: Boolean,
      default: false,
    },
  },
  capacity: {
    type: Number,
    default: 30,
    comment: 'Maximum participants',
  },
  cost: {
    type: Number,
    default: 0,
    comment: 'Cost per participant',
  },
  isMandatory: {
    type: Boolean,
    default: false,
  },
  targetAudience: {
    departments: [String],
    designations: [String],
    grades: [String],
    allEmployees: {
      type: Boolean,
      default: false,
    },
  },
  prerequisites: [{
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
    },
    courseCode: String,
  }],
  learningObjectives: [String],
  courseContent: [{
    module: String,
    topics: [String],
    duration: Number,
  }],
  assessmentRequired: {
    type: Boolean,
    default: false,
  },
  passingScore: {
    type: Number,
    default: 70,
    comment: 'Minimum score to pass (%)',
  },
  certificateIssued: {
    type: Boolean,
    default: false,
  },
  certificateValidity: {
    type: Number,
    comment: 'Certificate validity in months',
  },
  scormPackage: {
    url: String,
    version: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

courseSchema.index({ tenantId: 1, courseCode: 1 }, { unique: true });
courseSchema.index({ tenantId: 1, category: 1 });
courseSchema.index({ tenantId: 1, isMandatory: 1 });

courseSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Course', courseSchema);
