const TravelRequest = require('../models/TravelRequest');
const TravelPolicy = require('../models/TravelPolicy');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { sendNotification } = require('../utils/notificationService');

/**
 * Get all travel requests
 * BRD Requirement: HRMS-TRV-001
 */
exports.getTravelRequests = async (req, res) => {
  try {
    const { employeeId, status, travelType } = req.query;
    const filter = { tenantId: req.tenantId };

    // Security: If user is Employee, restrict to their own records ONLY
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ 
        email: req.user.email,
        tenantId: req.tenantId 
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee record not found for this user',
        });
      }

      filter.employeeId = employee._id;
    } else if (employeeId) {
      filter.employeeId = employeeId;
    }

    if (status) filter.status = status;
    if (travelType) filter.travelType = travelType;

    // Manager can see team member travel requests
    if (req.user.role === 'Manager' && !employeeId) {
      const teamMembers = await Employee.find({
        tenantId: req.tenantId,
        reportingManager: req.user._id,
      }).select('_id');
      filter.employeeId = { $in: teamMembers.map((e) => e._id) };
    }

    const travelRequests = await TravelRequest.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode grade')
      .populate('approverId', 'name email')
      .sort({ departureDate: -1 });

    res.status(200).json({
      success: true,
      count: travelRequests.length,
      data: travelRequests,
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
 * Get single travel request
 */
exports.getTravelRequest = async (req, res) => {
  try {
    const travelRequest = await TravelRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    })
      .populate('employeeId', 'firstName lastName employeeCode grade')
      .populate('approverId', 'name email');

    if (!travelRequest) {
      return res.status(404).json({
        success: false,
        message: 'Travel request not found',
      });
    }

    res.status(200).json({
      success: true,
      data: travelRequest,
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
 * Create travel request
 * BRD Requirement: HRMS-TRV-001, HRMS-TRV-002
 */
exports.createTravelRequest = async (req, res) => {
  try {
    const { travelType, purpose, departureDate, returnDate, origin, destination, mode, estimatedAmount, estimatedBreakdown, remarks } = req.body;

    if (!travelType || !purpose || !departureDate || !returnDate || !origin || !destination || !mode || !estimatedAmount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Find employee by user email
    const employee = await Employee.findOne({ 
      email: req.user.email,
      tenantId: req.tenantId
    });
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found for this user',
      });
    }

    // Validate dates
    const departure = new Date(departureDate);
    const returnDateObj = new Date(returnDate);
    
    if (departure >= returnDateObj) {
      return res.status(400).json({
        success: false,
        message: 'Return date must be after departure date',
      });
    }

    // BRD Requirement: Validate against travel policy
    const travelPolicy = await TravelPolicy.findOne({
      tenantId: req.tenantId,
      grade: employee.grade,
      status: 'Active',
    });

    let policyCompliant = true;
    const policyViolations = [];

    if (travelPolicy) {
      // Validate travel class based on mode
      if (mode === 'Air' && travelType === 'Domestic') {
        // Check if employee is requesting higher class than entitled
        // This would be validated during claim submission
      }
      
      // Validate estimated amount against policy limits
      if (travelPolicy.advanceLimit.maxAmount > 0 && estimatedAmount > travelPolicy.advanceLimit.maxAmount) {
        policyCompliant = false;
        policyViolations.push({
          field: 'estimatedAmount',
          violation: `Estimated amount exceeds maximum limit of ₹${travelPolicy.advanceLimit.maxAmount}`,
        });
      }
    }

    const travelRequest = await TravelRequest.create({
      tenantId: req.tenantId,
      employeeId: employee._id,
      travelType,
      purpose,
      departureDate: departure,
      returnDate: returnDateObj,
      origin,
      destination,
      mode,
      estimatedAmount,
      estimatedBreakdown: estimatedBreakdown || {},
      remarks,
      policyCompliant,
      policyViolations,
      status: 'Draft',
    });

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'Create',
      module: 'TRV',
      entityType: 'TravelRequest',
      entityId: travelRequest._id,
      description: `Created travel request: ${travelType} from ${origin} to ${destination}`,
      changes: JSON.stringify({ created: req.body }),
    });

    res.status(201).json({
      success: true,
      data: travelRequest,
      message: 'Travel request created successfully',
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
 * Update travel request
 */
exports.updateTravelRequest = async (req, res) => {
  try {
    const travelRequest = await TravelRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!travelRequest) {
      return res.status(404).json({
        success: false,
        message: 'Travel request not found',
      });
    }

    // Only allow updates if status is Draft
    if (travelRequest.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update travel request that is not in Draft status',
      });
    }

    Object.assign(travelRequest, req.body);
    await travelRequest.save();

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'Update',
      module: 'TRV',
      entityType: 'TravelRequest',
      entityId: travelRequest._id,
      description: `Updated travel request`,
      changes: JSON.stringify({ updated: req.body }),
    });

    res.status(200).json({
      success: true,
      data: travelRequest,
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
 * Submit travel request for approval
 * BRD Requirement: HRMS-TRV-003
 */
exports.submitTravelRequest = async (req, res) => {
  try {
    const travelRequest = await TravelRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('employeeId', 'firstName lastName employeeCode grade reportingManager');

    if (!travelRequest) {
      return res.status(404).json({
        success: false,
        message: 'Travel request not found',
      });
    }

    if (travelRequest.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: 'Travel request has already been submitted',
      });
    }

    // BRD Requirement: Route through approval workflow based on grade
    // For now, route to reporting manager
    travelRequest.status = 'Submitted';
    travelRequest.submittedDate = new Date();
    if (travelRequest.employeeId.reportingManager) {
      travelRequest.approverId = travelRequest.employeeId.reportingManager;
    }
    await travelRequest.save();

    // Send notification to approver
    // TODO: Implement notification

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'SUBMIT',
      module: 'TRV',
      entityType: 'TravelRequest',
      entityId: travelRequest._id,
      description: `Submitted travel request for approval`,
      changes: JSON.stringify({ submitted: true }),
    });

    res.status(200).json({
      success: true,
      data: travelRequest,
      message: 'Travel request submitted successfully',
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
 * Approve/Reject travel request
 * BRD Requirement: HRMS-TRV-003
 */
exports.approveTravelRequest = async (req, res) => {
  try {
    const { status, comments } = req.body;
    
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be Approved or Rejected',
      });
    }

    const travelRequest = await TravelRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('employeeId', 'firstName lastName employeeCode email');

    if (!travelRequest) {
      return res.status(404).json({
        success: false,
        message: 'Travel request not found',
      });
    }

    if (travelRequest.status !== 'Submitted') {
      return res.status(400).json({
        success: false,
        message: 'Travel request is not in Submitted status',
      });
    }

    travelRequest.status = status;
    travelRequest.approverId = req.user._id;
    travelRequest.approverName = req.user.name || req.user.email;
    travelRequest.approvalComments = comments;
    travelRequest.approvedDate = new Date();
    await travelRequest.save();

    // Send notification to employee
    if (travelRequest.employeeId && travelRequest.employeeId.email) {
      await sendNotification({
        to: travelRequest.employeeId.email,
        channels: ['email'],
        subject: `Travel Request ${status} - ${travelRequest.travelType}`,
        message: `Your travel request from ${travelRequest.origin} to ${travelRequest.destination} has been ${status.toLowerCase()}.${comments ? ` Comments: ${comments}` : ''}`,
        html: `
          <h2>Travel Request ${status}</h2>
          <p>Dear ${travelRequest.employeeId.firstName} ${travelRequest.employeeId.lastName},</p>
          <p>Your travel request has been ${status.toLowerCase()}:</p>
          <ul>
            <li><strong>Type:</strong> ${travelRequest.travelType}</li>
            <li><strong>Route:</strong> ${travelRequest.origin} to ${travelRequest.destination}</li>
            <li><strong>Dates:</strong> ${travelRequest.departureDate.toLocaleDateString()} to ${travelRequest.returnDate.toLocaleDateString()}</li>
            <li><strong>Estimated Amount:</strong> ₹${travelRequest.estimatedAmount}</li>
          </ul>
          ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
        `,
        tenantId: req.tenantId,
        userId: req.user._id,
        module: 'Travel Management',
        action: `Travel Request ${status}`,
      });
    }

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: status.toUpperCase(),
      module: 'TRV',
      entityType: 'TravelRequest',
      entityId: travelRequest._id,
      description: `${status} travel request`,
      changes: JSON.stringify({ status, comments }),
    });

    res.status(200).json({
      success: true,
      data: travelRequest,
      message: `Travel request ${status.toLowerCase()} successfully`,
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
 * Delete travel request
 */
exports.deleteTravelRequest = async (req, res) => {
  try {
    const travelRequest = await TravelRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!travelRequest) {
      return res.status(404).json({
        success: false,
        message: 'Travel request not found',
      });
    }

    // Only allow deletion if status is Draft
    if (travelRequest.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete travel request that is not in Draft status',
      });
    }

    await travelRequest.deleteOne();

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'Delete',
      module: 'TRV',
      entityType: 'TravelRequest',
      entityId: req.params.id,
      description: `Deleted travel request`,
      changes: JSON.stringify({ deleted: travelRequest.toObject() }),
    });

    res.status(200).json({
      success: true,
      message: 'Travel request deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
