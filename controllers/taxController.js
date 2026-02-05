const TaxDeclaration = require('../models/TaxDeclaration');
const Employee = require('../models/Employee');

// @desc    Get all tax declarations
// @route   GET /api/tax-declarations
// @access  Private
exports.getDeclarations = async (req, res) => {
  try {
    const { financialYear, status, employeeId } = req.query;
    const filter = { tenantId: req.tenantId };

    // Security Check: If user is Employee, restrict to their own records ONLY
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

    if (financialYear) filter.financialYear = financialYear;
    if (status) filter.status = status;

    const declarations = await TaxDeclaration.find(filter)
      .populate('employeeId', 'firstName lastName employeeCode department designation')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: declarations.length,
      data: declarations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get single tax declaration
// @route   GET /api/tax-declarations/:id
// @access  Private
exports.getDeclaration = async (req, res) => {
  try {
    const declaration = await TaxDeclaration.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).populate('employeeId', 'firstName lastName employeeCode department designation email');

    if (!declaration) {
      return res.status(404).json({
        success: false,
        message: 'Tax declaration not found',
      });
    }

    // Security Check: If user is Employee, ensure it belongs to them
    if (req.user.role === 'Employee') {
      const employee = await Employee.findOne({ 
        email: req.user.email,
        tenantId: req.tenantId 
      });
      
      if (!employee || declaration.employeeId._id.toString() !== employee._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this declaration',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: declaration,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Create new tax declaration
// @route   POST /api/tax-declarations
// @access  Private (Employee only)
exports.createDeclaration = async (req, res) => {
  try {
    const { financialYear, regime, declarations } = req.body;

    // Find the employee record associated with this user
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

    // Check if declaration already exists for this year
    const existingDeclaration = await TaxDeclaration.findOne({
      tenantId: req.tenantId,
      employeeId: employee._id,
      financialYear,
    });

    if (existingDeclaration) {
      return res.status(400).json({
        success: false,
        message: `Tax declaration for financial year ${financialYear} already exists`,
      });
    }

    const taxDeclaration = await TaxDeclaration.create({
      tenantId: req.tenantId,
      employeeId: employee._id,
      financialYear,
      regime,
      declarations,
      status: 'Submitted', // Default to Submitted when created
    });

    res.status(201).json({
      success: true,
      data: taxDeclaration,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Update tax declaration status (Admin only)
// @route   PUT /api/tax-declarations/:id/status
// @access  Private (Admin/HR only)
exports.updateDeclarationStatus = async (req, res) => {
  try {
    const { status, declarations } = req.body; // allow updating individual line items too

    let declaration = await TaxDeclaration.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });

    if (!declaration) {
      return res.status(404).json({
        success: false,
        message: 'Tax declaration not found',
      });
    }

    if (status) declaration.status = status;
    if (declarations) declaration.declarations = declarations;

    await declaration.save();

    res.status(200).json({
      success: true,
      data: declaration,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
