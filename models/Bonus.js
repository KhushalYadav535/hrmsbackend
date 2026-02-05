const mongoose = require('mongoose');

const bonusSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  amount: {
    type: mongoose.Schema.Types.Mixed, // Can be number or 'Variable'
    required: true,
  },
  frequency: {
    type: String,
    enum: ['Monthly', 'Quarterly', 'Yearly', 'One-time'],
    required: true,
  },
  paidTo: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Processed'],
    default: 'Active',
  },
  description: {
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

bonusSchema.index({ tenantId: 1, status: 1 });

bonusSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Bonus', bonusSchema);
