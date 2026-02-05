const mongoose = require('mongoose');

/**
 * Travel Claim Model
 * BRD Requirement: HRMS-TRV-005, BR-TRV-005
 * Comprehensive travel claim submission with expense items and bills
 */
const travelClaimSchema = new mongoose.Schema({
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
  travelRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TravelRequest',
    required: true,
    index: true,
  },
  travelAdvanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TravelAdvance',
    comment: 'Linked advance if any',
  },
  claimType: {
    type: String,
    enum: ['Regular Travel', 'LTA', 'Mileage', 'Other Allowance'],
    required: true,
  },
  // Travel expenses
  travelExpenses: [{
    date: Date,
    mode: String,
    from: String,
    to: String,
    ticketNumber: String,
    amount: Number,
    bookingCharges: Number,
    bills: [{
      name: String,
      url: String,
      uploadedDate: Date,
      gstNumber: String,
      gstAmount: Number,
    }],
  }],
  // Accommodation
  accommodation: [{
    hotelName: String,
    checkIn: Date,
    checkOut: Date,
    roomRent: Number,
    gstNumber: String,
    gstAmount: Number,
    bills: [{
      name: String,
      url: String,
      uploadedDate: Date,
    }],
  }],
  // Daily Allowance (DA)
  dailyAllowance: [{
    date: Date,
    city: String,
    cityClassification: {
      type: String,
      enum: ['A1', 'A', 'B', 'C'],
    },
    days: Number,
    rate: Number,
    amount: Number,
    comment: String,
  }],
  // Local conveyance
  localConveyance: [{
    date: Date,
    from: String,
    to: String,
    distance: Number,
    fare: Number,
    mode: String,
    bills: [{
      name: String,
      url: String,
      uploadedDate: Date,
    }],
  }],
  // Incidental expenses
  incidentalExpenses: [{
    category: String,
    date: Date,
    description: String,
    amount: Number,
    bills: [{
      name: String,
      url: String,
      uploadedDate: Date,
    }],
  }],
  // Mileage claim (for own vehicle)
  mileageClaim: {
    vehicleType: {
      type: String,
      enum: ['Two-Wheeler', 'Four-Wheeler'],
    },
    startOdometer: Number,
    endOdometer: Number,
    distance: Number,
    ratePerKm: Number,
    amount: Number,
    fuelBills: [{
      name: String,
      url: String,
      uploadedDate: Date,
    }],
    managerCertified: {
      type: Boolean,
      default: false,
    },
    certifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  // Totals
  totalTravelExpense: {
    type: Number,
    default: 0,
  },
  totalAccommodation: {
    type: Number,
    default: 0,
  },
  totalDailyAllowance: {
    type: Number,
    default: 0,
  },
  totalLocalConveyance: {
    type: Number,
    default: 0,
  },
  totalIncidental: {
    type: Number,
    default: 0,
  },
  totalMileage: {
    type: Number,
    default: 0,
  },
  totalClaimAmount: {
    type: Number,
    default: 0,
    comment: 'Total claim amount',
  },
  advancePaid: {
    type: Number,
    default: 0,
    comment: 'Advance already paid',
  },
  netPayable: {
    type: Number,
    default: 0,
    comment: 'Net amount payable to employee (claim - advance)',
  },
  netRecoverable: {
    type: Number,
    default: 0,
    comment: 'Net amount recoverable from employee (advance - claim)',
  },
  // Status and workflow
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Level1_Approved', 'Level2_Approved', 'Level3_Approved', 'Finance_Approved', 'Rejected', 'Settled', 'Paid'],
    default: 'Draft',
  },
  submittedDate: Date,
  // Multi-level approval
  level1ApproverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'Reporting Manager',
  },
  level1ApprovedDate: Date,
  level1Comments: String,
  level2ApproverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'Department Head (if claim > ₹25,000)',
  },
  level2ApprovedDate: Date,
  level2Comments: String,
  level3ApproverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'Finance (policy compliance)',
  },
  level3ApprovedDate: Date,
  level3Comments: String,
  financeApproverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'Finance approval for payment',
  },
  financeApprovedDate: Date,
  financeComments: String,
  // Policy validation
  policyValidated: {
    type: Boolean,
    default: false,
  },
  policyViolations: [{
    field: String,
    violation: String,
    justification: String,
  }],
  // Settlement
  settledDate: Date,
  paymentDate: Date,
  paymentReference: String,
  remarks: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

travelClaimSchema.index({ tenantId: 1, employeeId: 1 });
travelClaimSchema.index({ tenantId: 1, travelRequestId: 1 });
travelClaimSchema.index({ tenantId: 1, status: 1 });
travelClaimSchema.index({ tenantId: 1, submittedDate: 1 });

travelClaimSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Auto-calculate totals
  this.totalTravelExpense = this.travelExpenses.reduce((sum, exp) => sum + (exp.amount || 0) + (exp.bookingCharges || 0), 0);
  this.totalAccommodation = this.accommodation.reduce((sum, acc) => sum + (acc.roomRent || 0), 0);
  this.totalDailyAllowance = this.dailyAllowance.reduce((sum, da) => sum + (da.amount || 0), 0);
  this.totalLocalConveyance = this.localConveyance.reduce((sum, lc) => sum + (lc.fare || 0), 0);
  this.totalIncidental = this.incidentalExpenses.reduce((sum, inc) => sum + (inc.amount || 0), 0);
  this.totalMileage = this.mileageClaim?.amount || 0;
  
  this.totalClaimAmount = this.totalTravelExpense + this.totalAccommodation + this.totalDailyAllowance + 
                          this.totalLocalConveyance + this.totalIncidental + this.totalMileage;
  
  // Calculate net payable/recoverable
  if (this.totalClaimAmount > this.advancePaid) {
    this.netPayable = this.totalClaimAmount - this.advancePaid;
    this.netRecoverable = 0;
  } else {
    this.netPayable = 0;
    this.netRecoverable = this.advancePaid - this.totalClaimAmount;
  }
  
  next();
});

module.exports = mongoose.model('TravelClaim', travelClaimSchema);
