const mongoose = require('mongoose');

/**
 * Employee Nominee Model
 * BRD Requirement: Separate model for PF/Gratuity nominees
 * Supports multiple nominees with share percentages
 */
const employeeNomineeSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
  },
  nomineeName: {
    type: String,
    required: true,
    trim: true,
  },
  relationship: {
    type: String,
    required: true,
    trim: true,
    enum: ['Spouse', 'Child', 'Parent', 'Sibling', 'Other'],
  },
  dateOfBirth: {
    type: Date,
    required: true,
  },
  sharePercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    validate: {
      validator: function(value) {
        return value >= 0 && value <= 100;
      },
      message: 'Share percentage must be between 0 and 100',
    },
  },
  nomineeType: {
    type: String,
    enum: ['PF', 'Gratuity', 'Both'],
    required: true,
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

// Compound indexes
employeeNomineeSchema.index({ tenantId: 1, employeeId: 1 });
employeeNomineeSchema.index({ tenantId: 1, employeeId: 1, nomineeType: 1 });

// Validate total share percentage doesn't exceed 100% per nominee type
employeeNomineeSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('sharePercentage') || this.isModified('nomineeType')) {
    const existingNominees = await mongoose.model('EmployeeNominee').find({
      tenantId: this.tenantId,
      employeeId: this.employeeId,
      nomineeType: { $in: this.nomineeType === 'Both' ? ['PF', 'Gratuity', 'Both'] : [this.nomineeType, 'Both'] },
      _id: { $ne: this._id },
    });
    
    const totalShare = existingNominees.reduce((sum, n) => {
      if (n.nomineeType === 'Both' || this.nomineeType === 'Both' || n.nomineeType === this.nomineeType) {
        return sum + (n.sharePercentage || 0);
      }
      return sum;
    }, 0) + this.sharePercentage;
    
    if (totalShare > 100) {
      const error = new Error(`Total share percentage for ${this.nomineeType} nominees cannot exceed 100%. Current total: ${totalShare}%`);
      if (typeof next === 'function') {
        return next(error);
      }
      throw error;
    }
  }
  
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('EmployeeNominee', employeeNomineeSchema);
