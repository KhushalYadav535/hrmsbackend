const mongoose = require('mongoose');

const onboardingSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    index: true,
  },
  // Candidate details
  candidateName: {
    type: String,
    required: true,
    trim: true,
  },
  candidateEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  candidatePhone: {
    type: String,
    trim: true,
  },
  // Job details
  position: {
    type: String,
    required: true,
    trim: true,
  },
  department: {
    type: String,
    required: true,
    trim: true,
  },
  designation: {
    type: String,
    trim: true,
  },
  joiningDate: {
    type: Date,
    required: true,
  },
  // Employee ID (auto-generated)
  employeeCode: {
    type: String,
    unique: true,
    sparse: true,
  },
  // Portal access
  portalToken: {
    type: String,
    unique: true,
    sparse: true,
  },
  portalPassword: String,
  portalAccessGranted: {
    type: Boolean,
    default: false,
  },
  portalAccessDate: Date,
  // Status
  status: {
    type: String,
    enum: ['Pending', 'Offer Sent', 'Offer Accepted', 'Document Collection', 'Verification In Progress', 'Ready to Join', 'Joined', 'Completed', 'Cancelled', 'Rejected'],
    default: 'Pending',
  },
  tasks: [
    {
      title: {
        type: String,
        required: true,
      },
      description: {
        type: String,
        trim: true,
      },
      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      completed: {
        type: Boolean,
        default: false,
      },
      completedDate: {
        type: Date,
      },
      dueDate: {
        type: Date,
      },
    },
  ],
  documents: [
    {
      name: String,
      type: String,
      url: String,
      uploadedDate: Date,
      verified: {
        type: Boolean,
        default: false,
      },
    },
  ],
  completionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  notes: {
    type: String,
    trim: true,
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

onboardingSchema.index({ tenantId: 1, status: 1 });
onboardingSchema.index({ tenantId: 1, candidateEmail: 1 });

onboardingSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Calculate completion rate based on completed tasks
  if (this.tasks && this.tasks.length > 0) {
    const completedTasks = this.tasks.filter(t => t.completed).length;
    this.completionRate = Math.round((completedTasks / this.tasks.length) * 100);
  }
  
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Onboarding', onboardingSchema);
