const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  department: {
    type: String,
    required: true,
    trim: true,
  },
  // BR-HRMS-02: Link job to organization unit (branch)
  postingUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrganizationUnit',
    index: true,
    comment: 'Branch/Unit where position is available',
  },
  // Job Type: Internal (for transfers/promotions) or External (recruitment)
  jobType: {
    type: String,
    enum: ['Internal', 'External', 'Both'],
    default: 'External',
    comment: 'BR-HRMS-03: Internal jobs for transfers/promotions, External for recruitment',
  },
  // Position details
  designation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Designation',
    comment: 'Designation for this position',
  },
  grade: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grade',
    comment: 'Grade level for this position',
  },
  status: {
    type: String,
    enum: ['Open', 'Closed', 'On Hold', 'Filled'],
    default: 'Open',
  },
  postedDate: {
    type: Date,
    default: Date.now,
  },
  closingDate: {
    type: Date,
    comment: 'Job posting closing date',
  },
  applications: {
    type: Number,
    default: 0,
  },
  openPositions: {
    type: Number,
    required: true,
    min: 1,
  },
  filledPositions: {
    type: Number,
    default: 0,
    comment: 'Number of positions filled',
  },
  description: {
    type: String,
    trim: true,
  },
  requirements: {
    type: String,
    trim: true,
  },
  // Location from branch or manual
  location: {
    type: String,
    trim: true,
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    comment: 'Location reference (linked to branch)',
  },
  salaryRange: {
    type: String,
    trim: true,
  },
  minSalary: {
    type: Number,
    comment: 'Minimum salary for position',
  },
  maxSalary: {
    type: Number,
    comment: 'Maximum salary for position',
  },
  // Internal posting details
  isInternalPosting: {
    type: Boolean,
    default: false,
    comment: 'BR-HRMS-04: Internal posting for existing employees (transfers/promotions)',
  },
  eligibleGrades: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grade',
    comment: 'Eligible grades for internal applicants',
  }],
  minExperience: {
    type: Number,
    default: 0,
    comment: 'Minimum years of experience required',
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

jobSchema.index({ tenantId: 1, status: 1 });

jobSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Job', jobSchema);
