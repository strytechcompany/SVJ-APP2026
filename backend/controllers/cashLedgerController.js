const CashLedger = require('../models/CashLedger');

/**
 * Utility to log cash flow to the ledger.
 * Call this inside other controllers when cash is received or spent.
 */
exports.addLedgerEntry = async (data, session = null) => {
  const { type, amount, source, referenceId, referenceModel, description, createdBy } = data;
  
  if (!amount || amount === 0) return null;

  try {
    // Find last running balance. Uses a sort by _id because _id contains timestamp.
    // However, if called concurrently, race conditions may occur. For absolute safety,
    // transactions/sessions are recommended, but this is simple logging.
    const lastEntry = await CashLedger.findOne().sort({ _id: -1 }).session(session);
    const lastBalance = lastEntry ? lastEntry.balanceAfter : 0;

    let balanceAfter = lastBalance;
    if (type === 'IN' || type === 'INITIAL_BALANCE') {
      balanceAfter += amount;
    } else if (type === 'OUT') {
      balanceAfter -= amount;
    } else if (type === 'ADJUSTMENT') {
      balanceAfter = amount; // The admin directly sets the new current amount.
    }

    const ledger = new CashLedger({
      type,
      amount,
      source,
      referenceId,
      referenceModel,
      description,
      balanceAfter,
      createdBy
    });

    if (session) {
      await ledger.save({ session });
    } else {
      await ledger.save();
    }
    return ledger;
  } catch (err) {
    console.error('Error adding to cash ledger:', err);
    throw err;
  }
};

// ─── Express Endpoints for Cash Ledger UI ───────────────────────────────────────

exports.getLedgerHistory = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const total = await CashLedger.countDocuments();
    const history = await CashLedger.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'username');

    // Get current total cash (from latest entry)
    const lastEntry = await CashLedger.findOne().sort({ createdAt: -1 });
    const currentCash = lastEntry ? lastEntry.balanceAfter : 0;

    res.json({
      success: true,
      data: history,
      currentCash,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('getLedgerHistory error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.addManualAdjustment = async (req, res) => {
  try {
    const { amount, description } = req.body;
    
    if (amount === undefined || amount === null) {
      return res.status(400).json({ success: false, message: 'Amount is required' });
    }

    // Amount here is the NEW TARGET BALANCE because they are adjusting it.
    const entry = await exports.addLedgerEntry({
      type: 'ADJUSTMENT',
      amount: parseFloat(amount),
      source: 'Manual Adjustment',
      referenceId: req.user._id,
      referenceModel: 'User',
      description: description || 'Admin override',
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Cash Ledger updated successfully',
      data: entry
    });
  } catch (error) {
    console.error('addManualAdjustment error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
