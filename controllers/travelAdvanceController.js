const TravelAdvance = require('../models/TravelAdvance');
const TravelRequest = require('../models/TravelRequest');
const TravelPolicy = require('../models/TravelPolicy');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/notificationService');

/**
 * Get all travel advances
 * BRD Requirement: HRMS-TRV-005, BR-TRV-004
 */
exports.getTravelAdvances = async (req, res) => {
  try {
    const { employeeId, status, travelRequestId } = req.query;
    const filter = { tenantId: req.tenantId };

    if (employeeId) filter.employeeId = employeeId;
    if (status) filter.status = status;
    if (travelRequestId) filter.travelRequestId = travelRequestId;

    // Employee sees only their advances
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ 
        email: req.user.email,
        tenantId: req.tenantId 
      });
      if (employee) filter.employeeId = employee._id;
    }

    const advances = await TravelAdvance.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode')
      .populate('travelRequestId', 'travelType origin destination departureDate returnDate')
      .populate('approverId', 'name email')
      .sort({ requestedDate: -1 });

    res.status(200).json({
      success: true,
      count: advances.length,
      data: advances,
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
 * Create travel advance request
 * BRD Requirement: Auto-calculate eligible advance (80% of estimated)
 */
exports.createTravelAdvance = async (req, res) => {
  try {
    const { travelRequestId, estimatedAmount, advanceAmount, remarks } = req.body;

    if (!travelRequestId || !estimatedAmount) {
      return res.status(400).json({
        success: false,
        message: 'Travel request ID and estimated amount are required',
      });
    }

    // Verify travel request exists and is approved
    const travelRequest = await TravelRequest.findOne({
      _id: travelRequestId,
      tenantId: req.tenantId,
      status: 'Approved',
    });

    if (!travelRequest) {
      return res.status(404).json({
        success: false,
        message: 'Approved travel request not found',
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

    // Get travel policy for grade
    const travelPolicy = await TravelPolicy.findOne({
      tenantId: req.tenantId,
      grade: employee.grade,
      status: 'Active',
    });

    // Calculate eligible advance (80% of estimated, or policy limit)
    const eligibleAdvance = travelPolicy 
      ? Math.min(estimatedAmount * (travelPolicy.advanceLimit.percentage / 100), travelPolicy.advanceLimit.maxAmount || Infinity)
      : estimatedAmount * 0.8;

    // Validate requested advance amount
    const requestedAdvance = advanceAmount || eligibleAdvance;
    if (requestedAdvance > eligibleAdvance) {
      return res.status(400).json({
        success: false,
        message: `Advance amount cannot exceed eligible amount of ₹${eligibleAdvance}`,
      });
    }

    // Check if finance approval required
    const requiresFinanceApproval = travelPolicy && requestedAdvance >= travelPolicy.advanceLimit.financeApprovalThreshold;

    const travelAdvance = await TravelAdvance.create({
      tenantId: req.tenantId,
      employeeId: travelRequest.employeeId,
      travelRequestId,
      estimatedAmount,
      advanceAmount: requestedAdvance,
      eligibleAdvance,
      requiresFinanceApproval,
      status: 'Pending',
      requestedDate: new Date(),
    });

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'CREATE',
      module: 'TRV',
      entityType: 'TravelAdvance',
      entityId: travelAdvance._id,
      description: `Created travel advance request: ₹${requestedAdvance}`,
      changes: { created: req.body },
    });

    res.status(201).json({
      success: true,
      data: travelAdvance,
      message: 'Travel advance request created successfully',
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
 * Approve travel advance
 */
exports.approveTravelAdvance = async (req, res) => {
  try {
    const { comments } = req.body;

    const advance = await TravelAdvance.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      status: 'Pending',
    }).populate('employeeId', 'firstName lastName employeeCode email')
      .populate('travelRequestId');

    if (!advance) {
      return res.status(404).json({
        success: false,
        message: 'Travel advance not found or already processed',
      });
    }

    // Check if finance approval required
    if (advance.requiresFinanceApproval && req.user.role !== 'Finance Administrator' && req.user.role !== 'Tenant Admin') {
      // First level approval
      advance.approverId = req.user._id;
      advance.approverName = req.user.name || req.user.email;
      advance.approvalComments = comments;
      advance.approvedDate = new Date();
      // Status remains Pending until finance approval
    } else {
      // Final approval
      advance.status = 'Approved';
      advance.approverId = req.user._id;
      advance.approverName = req.user.name || req.user.email;
      advance.approvalComments = comments;
      advance.approvedDate = new Date();
      
      if (advance.requiresFinanceApproval) {
        advance.financeApproverId = req.user._id;
        advance.financeApprovedDate = new Date();
      }
    }

    await advance.save();

    // Send notification
    if (advance.employeeId && advance.employeeId.email) {
      await sendNotification({
        to: advance.employeeId.email,
        channels: ['email'],
        subject: `Travel Advance Approved - ₹${advance.advanceAmount}`,
        message: `Your travel advance request of ₹${advance.advanceAmount} has been approved.${advance.requiresFinanceApproval && advance.status === 'Pending' ? ' Awaiting finance approval.' : ''}`,
        tenantId: req.tenantId,
        userId: req.user._id,
        module: 'Travel Management',
        action: 'Travel Advance Approved',
      });
    }

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'APPROVE',
      module: 'TRV',
      entityType: 'TravelAdvance',
      entityId: advance._id,
      description: `Approved travel advance: ₹${advance.advanceAmount}`,
      changes: { approved: true, comments },
    });

    res.status(200).json({
      success: true,
      data: advance,
      message: 'Travel advance approved successfully',
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
 * Reject travel advance
 */
exports.rejectTravelAdvance = async (req, res) => {
  try {
    const { comments } = req.body;

    const advance = await TravelAdvance.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      status: 'Pending',
    }).populate('employeeId', 'firstName lastName employeeCode email');

    if (!advance) {
      return res.status(404).json({
        success: false,
        message: 'Travel advance not found or already processed',
      });
    }

    advance.status = 'Rejected';
    advance.approverId = req.user._id;
    advance.approverName = req.user.name || req.user.email;
    advance.approvalComments = comments;
    await advance.save();

    // Send notification
    if (advance.employeeId && advance.employeeId.email) {
      await sendNotification({
        to: advance.employeeId.email,
        channels: ['email'],
        subject: `Travel Advance Rejected`,
        message: `Your travel advance request has been rejected.${comments ? ` Reason: ${comments}` : ''}`,
        tenantId: req.tenantId,
        userId: req.user._id,
        module: 'Travel Management',
        action: 'Travel Advance Rejected',
      });
    }

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'REJECT',
      module: 'TRV',
      entityType: 'TravelAdvance',
      entityId: advance._id,
      description: `Rejected travel advance`,
      changes: { rejected: true, comments },
    });

    res.status(200).json({
      success: true,
      data: advance,
      message: 'Travel advance rejected',
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
 * Mark travel advance as paid
 */
exports.markTravelAdvancePaid = async (req, res) => {
  try {
    const { paymentReference, paymentMethod } = req.body;

    const advance = await TravelAdvance.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      status: 'Approved',
    });

    if (!advance) {
      return res.status(404).json({
        success: false,
        message: 'Approved travel advance not found',
      });
    }

    advance.status = 'Paid';
    advance.paidDate = new Date();
    advance.paymentReference = paymentReference;
    advance.paymentMethod = paymentMethod || 'Salary';
    await advance.save();

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'PAY',
      module: 'TRV',
      entityType: 'TravelAdvance',
      entityId: advance._id,
      description: `Marked travel advance as paid`,
      changes: { paid: true, paymentReference, paymentMethod },
    });

    res.status(200).json({
      success: true,
      data: advance,
      message: 'Travel advance marked as paid',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
