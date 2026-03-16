const SubscriptionPackage = require('../models/SubscriptionPackage');
const PlatformModule = require('../models/PlatformModule');

exports.getPackages = async (req, res) => {
  try {
    // US-A5-02: Filter out test data and archived packages by default
    const { includeArchived, includeTest } = req.query;
    const filter = {};
    
    if (includeArchived !== 'true') {
      filter.isArchived = { $ne: true };
    }
    
    // BR-A5-03: Test plans must not exist in production
    // Filter out test plans unless explicitly requested
    if (includeTest !== 'true') {
      filter.packageCode = { 
        $not: { 
          $regex: /^(test|testsd|demo|sample|temp)/i 
        } 
      };
      // BR-A5-04: Filter numeric-only or random-string names
      filter.packageName = {
        $not: {
          $regex: /^[\d\s]+$|^[a-z]{1,3}$/i
        }
      };
    }
    
    const packages = await SubscriptionPackage.find(filter)
      .sort({ packageTier: 1, createdAt: 1 });
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPackage = async (req, res) => {
  try {
    const pkg = await SubscriptionPackage.findById(req.params.id);
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
    res.json({ success: true, data: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createPackage = async (req, res) => {
  try {
    const pkg = await SubscriptionPackage.create({
      ...req.body,
      createdBy: req.user?.email || req.user?.id,
    });
    res.status(201).json({ success: true, data: pkg });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updatePackage = async (req, res) => {
  try {
    const pkg = await SubscriptionPackage.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?.email || req.user?.id },
      { new: true, runValidators: true }
    );
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
    res.json({ success: true, data: pkg });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// US-A5-02: Archive package instead of delete (preserves history)
exports.archivePackage = async (req, res) => {
  try {
    const pkg = await SubscriptionPackage.findById(req.params.id);
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
    
    // BR-A5-05: Archive preserves for historical records but hides from new assignment
    pkg.isArchived = true;
    pkg.archivedAt = new Date();
    pkg.archivedBy = req.user?.email || req.user?.id;
    pkg.isActive = false; // Also deactivate when archiving
    await pkg.save();
    
    res.json({ success: true, message: 'Package archived successfully', data: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePackage = async (req, res) => {
  try {
    const pkg = await SubscriptionPackage.findById(req.params.id);
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
    
    // BR-A5-05: If package has active tenant assignments, archive instead of delete
    const Tenant = require('../models/Tenant');
    const tenantsWithPackage = await Tenant.countDocuments({ 
      subscriptionPlanId: req.params.id,
      status: 'active'
    });
    
    if (tenantsWithPackage > 0) {
      // Archive instead of delete
      pkg.isArchived = true;
      pkg.archivedAt = new Date();
      pkg.archivedBy = req.user?.email || req.user?.id;
      pkg.isActive = false;
      await pkg.save();
      return res.json({ 
        success: true, 
        message: 'Package archived (has active tenant assignments). Cannot delete.', 
        data: pkg 
      });
    }
    
    // Safe to delete if no active assignments
    await SubscriptionPackage.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Package deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
