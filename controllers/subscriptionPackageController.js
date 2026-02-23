const SubscriptionPackage = require('../models/SubscriptionPackage');
const PlatformModule = require('../models/PlatformModule');

exports.getPackages = async (req, res) => {
  try {
    const packages = await SubscriptionPackage.find().sort({ packageTier: 1, createdAt: 1 });
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

exports.deletePackage = async (req, res) => {
  try {
    const pkg = await SubscriptionPackage.findByIdAndDelete(req.params.id);
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
    res.json({ success: true, message: 'Package deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
