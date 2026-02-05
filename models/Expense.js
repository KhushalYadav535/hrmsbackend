const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
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
  category: {
    type: String,
    enum: ['Travel', 'Accommodation', 'Meals', 'Communication', 'Other'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Submitted', 'Pending', 'Approved', 'Rejected', 'Paid'],
    default: 'Submitted',
  },
  receiptUrl: {
    type: String,
  },
  submittedDate: {
    type: Date,
    default: Date.now,
  },
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approverName: {
    type: String,
  },
  comments: {
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

expenseSchema.index({ tenantId: 1, employeeId: 1 });
expenseSchema.index({ tenantId: 1, status: 1 });
expenseSchema.index({ tenantId: 1, approverId: 1, status: 1 });

expenseSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Expense', expenseSchema);
