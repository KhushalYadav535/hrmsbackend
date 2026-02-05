const LTA = require('../models/LTA');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');

/**
 * Get LTA records
 * BRD Requirement: BR-TRV-003, BR-TRV-011
 */
exports.getLTAs = async (req, res) => {
  try {
    const { employeeId, blockYear, status } = req.query;
    const filter = { tenantId: req.tenantId };

    if (employeeId) filter.employeeId = employeeId;
    if (blockYear) filter.blockYear = blockYear;
    if (status) filter.status = status;

    // Employee sees only their LTA
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ 
        email: req.user.email,
        tenantId: req.tenantId 
      });
      if (employee) filter.employeeId = employee._id;
    }

    const ltas = await LTA.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode')
      .sort({ blockStartDate: -1 });

    res.status(200).json({
      success: true,
      count: ltas.length,
      data: ltas,
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
 * Get LTA balance for employee
 */
exports.getLTABalance = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await Employee.findOne({
      _id: employeeId,
      tenantId: req.tenantId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Get current active LTA block
    const currentDate = new Date();
    const activeLTA = await LTA.findOne({
      tenantId: req.tenantId,
      employeeId,
      blockStartDate: { $lte: currentDate },
      blockEndDate: { $gte: currentDate },
      status: 'Active',
    });

    if (!activeLTA) {
      return res.status(200).json({
        success: true,
        data: {
          blockYear: null,
          totalJourneys: 0,
          journeysUtilized: 0,
          journeysRemaining: 0,
          blockEndDate: null,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        blockYear: activeLTA.blockYear,
        totalJourneys: activeLTA.totalJourneys,
        journeysUtilized: activeLTA.journeysUtilized,
        journeysRemaining: activeLTA.journeysRemaining,
        blockStartDate: activeLTA.blockStartDate,
        blockEndDate: activeLTA.blockEndDate,
        taxExemptAmount: activeLTA.taxExemptAmount,
        journeys: activeLTA.journeys,
      },
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
 * Create/Initialize LTA block
 */
exports.createLTA = async (req, res) => {
  try {
    const { employeeId, blockYear, blockStartDate, blockEndDate, totalJourneys } = req.body;

    if (!employeeId || !blockYear || !blockStartDate || !blockEndDate) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, block year, start date, and end date are required',
      });
    }

    // Check for duplicate
    const existing = await LTA.findOne({
      tenantId: req.tenantId,
      employeeId,
      blockYear,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `LTA block ${blockYear} already exists for this employee`,
      });
    }

    const lta = await LTA.create({
      tenantId: req.tenantId,
      employeeId,
      blockYear,
      blockStartDate: new Date(blockStartDate),
      blockEndDate: new Date(blockEndDate),
      totalJourneys: totalJourneys || 2,
      journeysRemaining: totalJourneys || 2,
    });

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'CREATE',
      module: 'TRV',
      entityType: 'LTA',
      entityId: lta._id,
      description: `Created LTA block ${blockYear} for employee`,
      changes: { created: req.body },
    });

    res.status(201).json({
      success: true,
      data: lta,
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
 * Add LTA journey
 */
exports.addLTAJourney = async (req, res) => {
  try {
    const { journeyDate, origin, destination, mode, familyMembers, actualFare, entitledClassFare, ticketCopies } = req.body;

    const lta = await LTA.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!lta) {
      return res.status(404).json({
        success: false,
        message: 'LTA record not found',
      });
    }

    if (lta.journeysRemaining <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No journeys remaining in this LTA block',
      });
    }

    const eligibleAmount = Math.min(actualFare || 0, entitledClassFare || 0);

    lta.journeys.push({
      journeyDate: new Date(journeyDate),
      origin,
      destination,
      mode,
      familyMembers: familyMembers || [],
      actualFare,
      entitledClassFare,
      eligibleAmount,
      ticketCopies: ticketCopies || [],
      status: 'Draft',
    });

    lta.journeysUtilized += 1;
    await lta.save();

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'ADD_JOURNEY',
      module: 'TRV',
      entityType: 'LTA',
      entityId: lta._id,
      description: `Added LTA journey: ${origin} to ${destination}`,
      changes: { journeyAdded: req.body },
    });

    res.status(200).json({
      success: true,
      data: lta,
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
 * Approve LTA journey
 */
exports.approveLTAJourney = async (req, res) => {
  try {
    const { journeyIndex } = req.body;

    const lta = await LTA.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!lta || !lta.journeys[journeyIndex]) {
      return res.status(404).json({
        success: false,
        message: 'LTA journey not found',
      });
    }

    lta.journeys[journeyIndex].status = 'Approved';
    lta.journeys[journeyIndex].approvedDate = new Date();
    await lta.save();

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'APPROVE_JOURNEY',
      module: 'TRV',
      entityType: 'LTA',
      entityId: lta._id,
      description: `Approved LTA journey`,
      changes: { journeyIndex },
    });

    res.status(200).json({
      success: true,
      data: lta,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
