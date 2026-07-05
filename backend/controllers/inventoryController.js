const ReceivedInventory = require('../models/ReceivedInventory');

exports.getReceivedInventory = async (req, res) => {
  try {
    const { filter = 'All', page = 1, limit = 50 } = req.query;
    
    let query = {};
    const now = new Date();
    
    if (filter === 'Today') {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      query.createdAt = { $gte: startOfToday };
    } else if (filter === 'This Week') {
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
      startOfWeek.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: startOfWeek };
    } else if (filter === 'This Month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      query.createdAt = { $gte: startOfMonth };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await ReceivedInventory.countDocuments(query);
    
    const records = await ReceivedInventory.find(query)
      .populate('customerId', 'customerName phoneNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: records,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (error) {
    console.error('getReceivedInventory Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getReceivedSummary = async (req, res) => {
  try {
    const result = await ReceivedInventory.aggregate([
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
          totalWeight: { $sum: '$weight' },
          totalPurity: { $sum: '$purity' },
          totalAmount: { $sum: '$amount' },
        }
      }
    ]);

    const summary = result.length > 0 
      ? {
          totalEntries: result[0].totalEntries,
          totalWeight: result[0].totalWeight,
          totalPurity: result[0].totalPurity,
          totalAmount: result[0].totalAmount,
        }
      : { totalEntries: 0, totalWeight: 0, totalPurity: 0, totalAmount: 0 };

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('getReceivedSummary Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
