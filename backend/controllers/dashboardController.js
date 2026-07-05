const GoldRate = require('../models/GoldRate');
const IssuedRecord = require('../models/IssuedRecord');

// GET /api/dashboard/gold-rate
exports.getGoldRate = async (req, res) => {
  try {
    let goldRate = await GoldRate.findOne().sort({ updatedAt: -1 });
    if (!goldRate) {
      goldRate = await GoldRate.create({
        rate: 0,
        effectiveDate: '',
        updatedBy: 'System',
      });
    }
    res.json({ success: true, data: goldRate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/dashboard/gold-rate
exports.updateGoldRate = async (req, res) => {
  try {
    const { rate, effectiveDate } = req.body;

    if (rate === undefined || rate === null || isNaN(Number(rate))) {
      return res.status(400).json({ success: false, message: 'Valid rate is required' });
    }

    let goldRate = await GoldRate.findOne().sort({ updatedAt: -1 });

    if (goldRate) {
      goldRate.rate = Number(rate);
      goldRate.effectiveDate = effectiveDate || '';
      goldRate.updatedAt = new Date();
      goldRate.updatedBy = req.user?.name || 'Admin';
      await goldRate.save();
    } else {
      goldRate = await GoldRate.create({
        rate: Number(rate),
        effectiveDate: effectiveDate || '',
        updatedBy: req.user?.name || 'Admin',
      });
    }

    res.json({ success: true, data: goldRate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/dashboard/recent-issued
exports.getRecentIssued = async (req, res) => {
  try {
    const records = await IssuedRecord.find()
      .sort({ createdAt: -1 })
      .limit(10);
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
