const mongoose = require('mongoose');

/**
 * Position Model
 * BR-HRMS-06: Track vacant positions per branch/department
 * Links to Job postings and organization units
 */
const positionSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  positionCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    unique: true,
    comment: 'Unique position code (e.g., POS-BR-001-MGR)',
  },
  title: {
    type: String,
    required: true,
    trim: true,
    comment: 'Position title (e.g., Branch Manager, Loan Officer)',
  },
  designation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Designation',
    required: true,
    comment: 'Designation for this position',
  },
  grade: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grade',
    comment: 'Grade level',
  },
  department: {
    type: String,
    required: true,
    trim: true,
  },
  // BR-HRMS-06: Position linked to organization unit (branch)
  postingUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrganizationUnit',
    required: true,
    index: true,
    comment: 'Branch/Unit where position exists',
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    comment: 'Location (auto-linked from branch)',
  },
  // Position status
  status: {
    type: String,
    enum: ['Vacant', 'Filled', 'On Hold', 'Cancelled'],
    default: 'Vacant',
    index: true,
  },
  // Current employee holding position (if filled)
  currentEmployeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    comment: 'Employee currently holding this position',
  },
  // Position details
  reportingManagerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    comment: 'Reporting manager for this position',
  },
  minExperience: {
    type: Number,
    default: 0,
    comment: 'Minimum years of experience required',
  },
  minSalary: {
    type: Number,
    comment: 'Minimum salary for position',
  },
  maxSalary: {
    type: Number,
    comment: 'Maximum salary for position',
  },
  // Job posting link
  jobPostingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    comment: 'Linked job posting (if posted)',
  },
  // Vacancy details
  vacancyDate: {
    type: Date,
    comment: 'Date when position became vacant',
  },
  filledDate: {
    type: Date,
    comment: 'Date when position was filled',
  },
  // Position history
  positionHistory: [{
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    reason: { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  }],
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
  requirements: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Indexes
positionSchema.index({ tenantId: 1, postingUnitId: 1, status: 1 });
positionSchema.index({ tenantId: 1, designation: 1 });
positionSchema.index({ tenantId: 1, positionCode: 1 }, { unique: true });

// Pre-save hook
positionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Position', positionSchema);
