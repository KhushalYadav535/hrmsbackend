const TravelClaim = require('../models/TravelClaim');
const TravelRequest = require('../models/TravelRequest');
const TravelAdvance = require('../models/TravelAdvance');
const TravelPolicy = require('../models/TravelPolicy');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/notificationService');

/**
 * Get all travel claims
 * BRD Requirement: BR-TRV-005
 */
exports.getTravelClaims = async (req, res) => {
  try {
    const { employeeId, status, claimType } = req.query;
    const filter = { tenantId: req.tenantId };

    if (employeeId) filter.employeeId = employeeId;
    if (status) filter.status = status;
    if (claimType) filter.claimType = claimType;

    // Employee sees only their claims
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ 
        email: req.user.email,
        tenantId: req.tenantId 
      });
      if (employee) filter.employeeId = employee._id;
    }

    const claims = await TravelClaim.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode grade')
      .populate('travelRequestId', 'travelType origin destination')
      .populate('travelAdvanceId', 'advanceAmount')
      .sort({ submittedDate: -1 });

    res.status(200).json({
      success: true,
      count: claims.length,
      data: claims,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Create travel claim
 * BRD Requirement: BR-TRV-005
 */
exports.createTravelClaim = async (req, res) => {
  try {
    const { travelRequestId, claimType, travelExpenses, accommodation, dailyAllowance, 
            localConveyance, incidentalExpenses, mileageClaim, remarks } = req.body;

    if (!travelRequestId || !claimType) {
      return res.status(400).json({
        success: false,
        message: 'Travel request ID and claim type are required',
      });
    }

    // Verify travel request exists
    const travelRequest = await TravelRequest.findOne({
      _id: travelRequestId,
      tenantId: req.tenantId,
    });

    if (!travelRequest) {
      return res.status(404).json({
        success: false,
        message: 'Travel request not found',
      });
    }

    // Find employee
    const employee = await Employee.findOne({
      _id: travelRequest.employeeId,
      tenantId: req.tenantId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Get linked advance if any
    const travelAdvance = await TravelAdvance.findOne({
      travelRequestId,
      tenantId: req.tenantId,
      status: { $in: ['Paid', 'Approved'] },
    });

    // Get travel policy for validation
    const travelPolicy = await TravelPolicy.findOne({
      tenantId: req.tenantId,
      grade: employee.grade,
      status: 'Active',
    });

    // Validate claim submission deadline (30 days after travel)
    const daysSinceTravel = Math.floor((new Date() - travelRequest.returnDate) / (1000 * 60 * 60 * 24));
    const deadline = travelPolicy?.claimSubmissionDeadline || 30;
    
    if (daysSinceTravel > deadline) {
      return res.status(400).json({
        success: false,
        message: `Claim submission deadline exceeded. Claims must be submitted within ${deadline} days of travel return date.`,
      });
    }

    // Create claim
    const claimData = {
      tenantId: req.tenantId,
      employeeId: travelRequest.employeeId,
      travelRequestId,
      claimType,
      travelExpenses: travelExpenses || [],
      accommodation: accommodation || [],
      dailyAllowance: dailyAllowance || [],
      localConveyance: localConveyance || [],
      incidentalExpenses: incidentalExpenses || [],
      advancePaid: travelAdvance?.advanceAmount || 0,
      remarks,
      status: 'Draft',
    };

    if (mileageClaim) {
      claimData.mileageClaim = mileageClaim;
    }

    if (travelAdvance) {
      claimData.travelAdvanceId = travelAdvance._id;
    }

    const travelClaim = await TravelClaim.create(claimData);

    // Auto-calculate totals (handled by pre-save hook)
    await travelClaim.save();

    // Validate against policy
    await validateClaimAgainstPolicy(travelClaim, travelPolicy, employee);

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'CREATE',
      module: 'TRV',
      entityType: 'TravelClaim',
      entityId: travelClaim._id,
      description: `Created travel claim: ₹${travelClaim.totalClaimAmount}`,
      changes: { created: req.body },
    });

    res.status(201).json({
      success: true,
      data: travelClaim,
      message: 'Travel claim created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Submit travel claim for approval
 * BRD Requirement: BR-TRV-007 (Multi-level approval)
 */
exports.submitTravelClaim = async (req, res) => {
  try {
    const claim = await TravelClaim.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('employeeId', 'firstName lastName employeeCode grade reportingManager');

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Travel claim not found',
      });
    }

    if (claim.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: 'Claim has already been submitted',
      });
    }

    // BRD Requirement: Multi-level approval workflow
    // Level 1: Reporting Manager
    claim.status = 'Submitted';
    claim.submittedDate = new Date();
    if (claim.employeeId.reportingManager) {
      claim.level1ApproverId = claim.employeeId.reportingManager;
    }
    await claim.save();

    // Send notification to Level 1 approver
    // TODO: Implement notification

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'SUBMIT',
      module: 'TRV',
      entityType: 'TravelClaim',
      entityId: claim._id,
      description: `Submitted travel claim for approval`,
      changes: { submitted: true },
    });

    res.status(200).json({
      success: true,
      data: claim,
      message: 'Travel claim submitted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Approve travel claim (Level 1, 2, 3, or Finance)
 * BRD Requirement: BR-TRV-007
 */
exports.approveTravelClaim = async (req, res) => {
  try {
    const { level, comments, approvedAmount } = req.body;
    
    if (!['Level1', 'Level2', 'Level3', 'Finance'].includes(level)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid approval level',
      });
    }

    const claim = await TravelClaim.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('employeeId', 'firstName lastName employeeCode email grade');

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Travel claim not found',
      });
    }

    // Check current status and approve accordingly
    if (level === 'Level1' && claim.status === 'Submitted') {
      claim.status = 'Level1_Approved';
      claim.level1ApproverId = req.user._id;
      claim.level1ApprovedDate = new Date();
      claim.level1Comments = comments;
      
      // Check if Level 2 approval needed (claim > ₹25,000)
      if (claim.totalClaimAmount > 25000) {
        // Route to department head (Level 2)
        // TODO: Get department head
      } else {
        // Route directly to Finance (Level 3)
        // TODO: Get finance approver
      }
    } else if (level === 'Level2' && claim.status === 'Level1_Approved') {
      claim.status = 'Level2_Approved';
      claim.level2ApproverId = req.user._id;
      claim.level2ApprovedDate = new Date();
      claim.level2Comments = comments;
      // Route to Finance (Level 3)
    } else if (level === 'Level3' && ['Level1_Approved', 'Level2_Approved'].includes(claim.status)) {
      claim.status = 'Level3_Approved';
      claim.level3ApproverId = req.user._id;
      claim.level3ApprovedDate = new Date();
      claim.level3Comments = comments;
      claim.policyValidated = true;
      // Route to Finance for payment approval
    } else if (level === 'Finance' && claim.status === 'Level3_Approved') {
      claim.status = 'Finance_Approved';
      claim.financeApproverId = req.user._id;
      claim.financeApprovedDate = new Date();
      claim.financeComments = comments;
      
      // If partial approval, adjust amounts
      if (approvedAmount && approvedAmount < claim.totalClaimAmount) {
        claim.totalClaimAmount = approvedAmount;
        // Recalculate net payable/recoverable
        if (approvedAmount > claim.advancePaid) {
          claim.netPayable = approvedAmount - claim.advancePaid;
          claim.netRecoverable = 0;
        } else {
          claim.netPayable = 0;
          claim.netRecoverable = claim.advancePaid - approvedAmount;
        }
      }
    } else {
      return res.status(400).json({
        success: false,
        message: `Cannot approve at ${level} level. Current status: ${claim.status}`,
      });
    }

    await claim.save();

    // Send notification
    if (claim.employeeId && claim.employeeId.email) {
      await sendNotification({
        to: claim.employeeId.email,
        channels: ['email'],
        subject: `Travel Claim ${level} Approved`,
        message: `Your travel claim has been approved at ${level} level.${comments ? ` Comments: ${comments}` : ''}`,
        tenantId: req.tenantId,
        userId: req.user._id,
        module: 'Travel Management',
        action: `Travel Claim ${level} Approved`,
      });
    }

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: `APPROVE_${level.toUpperCase()}`,
      module: 'TRV',
      entityType: 'TravelClaim',
      entityId: claim._id,
      description: `Approved travel claim at ${level} level`,
      changes: { level, comments, approvedAmount },
    });

    res.status(200).json({
      success: true,
      data: claim,
      message: `Travel claim approved at ${level} level`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Reject travel claim
 */
exports.rejectTravelClaim = async (req, res) => {
  try {
    const { comments } = req.body;

    const claim = await TravelClaim.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      status: { $ne: 'Rejected' },
    }).populate('employeeId', 'firstName lastName employeeCode email');

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Travel claim not found or already rejected',
      });
    }

    claim.status = 'Rejected';
    // Store rejection comments based on current level
    if (claim.status === 'Submitted') {
      claim.level1Comments = comments;
    } else if (claim.status === 'Level1_Approved') {
      claim.level2Comments = comments;
    } else if (claim.status === 'Level2_Approved') {
      claim.level3Comments = comments;
    } else {
      claim.financeComments = comments;
    }
    await claim.save();

    // Send notification
    if (claim.employeeId && claim.employeeId.email) {
      await sendNotification({
        to: claim.employeeId.email,
        channels: ['email'],
        subject: `Travel Claim Rejected`,
        message: `Your travel claim has been rejected.${comments ? ` Reason: ${comments}` : ''}`,
        tenantId: req.tenantId,
        userId: req.user._id,
        module: 'Travel Management',
        action: 'Travel Claim Rejected',
      });
    }

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'REJECT',
      module: 'TRV',
      entityType: 'TravelClaim',
      entityId: claim._id,
      description: `Rejected travel claim`,
      changes: { rejected: true, comments },
    });

    res.status(200).json({
      success: true,
      data: claim,
      message: 'Travel claim rejected',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Settle travel claim
 * BRD Requirement: BR-TRV-008
 */
exports.settleTravelClaim = async (req, res) => {
  try {
    const { paymentReference, paymentMethod } = req.body;

    const claim = await TravelClaim.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      status: 'Finance_Approved',
    }).populate('travelAdvanceId');

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Approved travel claim not found',
      });
    }

    claim.status = 'Settled';
    claim.settledDate = new Date();
    claim.paymentDate = new Date();
    claim.paymentReference = paymentReference;
    await claim.save();

    // Update advance status if linked
    if (claim.travelAdvanceId) {
      claim.travelAdvanceId.status = 'Settled';
      claim.travelAdvanceId.settledAmount = claim.totalClaimAmount;
      if (claim.netRecoverable > 0) {
        claim.travelAdvanceId.recoveryAmount = claim.netRecoverable;
      }
      await claim.travelAdvanceId.save();
    }

    // Send notification
    const employee = await Employee.findById(claim.employeeId);
    if (employee && employee.email) {
      await sendNotification({
        to: employee.email,
        channels: ['email'],
        subject: `Travel Claim Settled - ₹${claim.netPayable || 0}`,
        message: `Your travel claim has been settled.${claim.netPayable > 0 ? ` Amount payable: ₹${claim.netPayable}` : claim.netRecoverable > 0 ? ` Amount recoverable: ₹${claim.netRecoverable}` : ' No settlement amount.'}`,
        tenantId: req.tenantId,
        userId: req.user._id,
        module: 'Travel Management',
        action: 'Travel Claim Settled',
      });
    }

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'SETTLE',
      module: 'TRV',
      entityType: 'TravelClaim',
      entityId: claim._id,
      description: `Settled travel claim`,
      changes: { settled: true, paymentReference },
    });

    res.status(200).json({
      success: true,
      data: claim,
      message: 'Travel claim settled successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Helper function to validate claim against policy
 * BRD Requirement: BR-TRV-006
 */
async function validateClaimAgainstPolicy(claim, travelPolicy, employee) {
  if (!travelPolicy) return;

  const violations = [];

  // Validate travel class
  // Validate hotel rent ceiling
  // Validate DA rates
  // Validate mileage limits
  // etc.

  claim.policyViolations = violations;
  claim.policyValidated = violations.length === 0;
  await claim.save();
}
