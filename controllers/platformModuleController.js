const PlatformModule = require('../models/PlatformModule');

exports.createModule = async (req, res) => {
  try {
    const mod = await PlatformModule.create({
      ...req.body,
      createdBy: req.user?.email || req.user?.id,
    });
    res.status(201).json({ success: true, data: mod });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateModule = async (req, res) => {
  try {
    const mod = await PlatformModule.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user?.email || req.user?.id },
      { new: true, runValidators: true }
    );
    if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });
    res.json({ success: true, data: mod });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
