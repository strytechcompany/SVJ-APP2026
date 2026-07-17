const LineStockSettlement = require('../models/LineStockSettlement');
const LineStockTransaction = require('../models/LineStockTransaction');
const Stock = require('../models/Stock');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const cashLedgerController = require('./cashLedgerController');

exports.createSettlement = async (req, res) => {
  try {
    const {
      lineStockTransactionId,
      customerId,
      soldItems,
      returnedItems,
      paymentDetails,
      remarks
    } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const lsTransaction = await LineStockTransaction.findById(lineStockTransactionId);
    if (!lsTransaction) {
      return res.status(404).json({ success: false, message: 'Line Stock Transaction not found' });
    }

    // Process Returned Items (Restore Stock)
    let totalReturnedWeight = 0;
    for (const item of returnedItems) {
      totalReturnedWeight += item.weight;
      const stockItem = await Stock.findById(item.stockId);
      if (stockItem) {
        stockItem.quantity += item.count;
        stockItem.isAvailable = true;
        await stockItem.save();
      }
    }

    let totalSoldWeight = 0;
    for (const item of soldItems) {
      totalSoldWeight += item.weight;
    }

    // Calculate Balances
    const previousBalance = customer.oldBalance;
    // As per user request: deduct both returned and sold weights.
    let finalBalance = previousBalance - totalSoldWeight - totalReturnedWeight;

    // Payments are not involved in calculation anymore
    let newAdvance = customer.advance;
    if (finalBalance < 0) {
      newAdvance += Math.abs(finalBalance);
      finalBalance = 0;
    }

    // Update Customer
    customer.oldBalance = finalBalance;
    customer.advance = newAdvance;
    await customer.save();

    const status = finalBalance === 0 ? 'SETTLED' : 'ACTIVE';

    // Reuse an existing draft settlement (built up via incremental Sold Product
    // saves) instead of creating a second document for the same transaction.
    let settlement = await LineStockSettlement.findOne({ lineStockTransactionId, isDraft: true });
    if (settlement) {
      settlement.soldItems = soldItems;
      settlement.returnedItems = returnedItems;
      settlement.paymentDetails = paymentDetails;
      settlement.previousBalance = previousBalance;
      settlement.finalBalance = finalBalance;
      settlement.advanceBalance = newAdvance;
      settlement.remarks = remarks;
      settlement.status = status;
      settlement.isDraft = false;
      settlement.settledBy = req.user?.name || req.user?.email || 'System';
      await settlement.save();
    } else {
      settlement = new LineStockSettlement({
        lineStockTransactionId,
        customerId,
        soldItems,
        returnedItems,
        paymentDetails,
        previousBalance,
        finalBalance,
        advanceBalance: newAdvance,
        remarks,
        status,
        isDraft: false,
        settledBy: req.user?.name || req.user?.email || 'System',
        createdBy: req.user._id,
      });
      await settlement.save();
    }

    // Mark LineStockTransaction as SETTLED
    lsTransaction.status = 'SETTLED';
    await lsTransaction.save();

    // Log Cash Payment to Cash Ledger
    if (paymentDetails && paymentDetails.cash > 0) {
      await cashLedgerController.addLedgerEntry({
        type: 'IN',
        amount: paymentDetails.cash,
        source: 'Line Stock Settlement',
        referenceId: settlement._id,
        referenceModel: 'LineStockSettlement',
        description: `Cash received from Line Stock Settlement ${settlement.settlementNumber}`,
        createdBy: req.user ? req.user._id : undefined
      });
    }

    // Record in Transaction History
    const ledgerEntry = new Transaction({
      customerId,
      transactionType: 'LINE_STOCK_SETTLEMENT',
      transactionSubtype: 'FULL_TRANSACTION',
      transactionNumber: settlement.settlementNumber,
      totalWeight: 0,
      amountReceived: paymentDetails.cash + paymentDetails.online + paymentDetails.card,
      gramReceived: 0, // No payment conversion
      oldBalanceBefore: previousBalance,
      oldBalanceAfter: finalBalance,
      description: `Line Stock Settlement ${settlement.settlementNumber}. ${remarks || ''}`,
      createdBy: req.user._id,
    });
    await ledgerEntry.save();

    res.status(201).json({
      success: true,
      message: 'Settlement created successfully',
      data: settlement,
    });
  } catch (error) {
    console.error('createSettlement Error:', error);
    res.status(500).json({ success: false, message: 'Server error processing settlement' });
  }
};

// ─── Save/Update a single Sold Product into the draft settlement ─────────────
// Persists incrementally as the admin marks items sold and enters an amount —
// well before payments are known or the settlement is finalized. Does NOT
// touch stock, customer balance, or the cash ledger; those only happen when
// the settlement is finalized via createSettlement.
exports.saveSoldItem = async (req, res) => {
  try {
    const { lineStockTransactionId, customerId, item } = req.body;
    if (!lineStockTransactionId || !item || !item.stockId) {
      return res.status(400).json({ success: false, message: 'lineStockTransactionId and item.stockId are required.' });
    }

    const lsTransaction = await LineStockTransaction.findById(lineStockTransactionId);
    if (!lsTransaction) {
      return res.status(404).json({ success: false, message: 'Line Stock Transaction not found' });
    }
    if (lsTransaction.status === 'SETTLED') {
      return res.status(400).json({ success: false, message: 'This transaction is already settled.' });
    }

    let draft = await LineStockSettlement.findOne({ lineStockTransactionId, isDraft: true });
    if (!draft) {
      draft = new LineStockSettlement({
        lineStockTransactionId,
        customerId,
        soldItems: [],
        returnedItems: [],
        paymentDetails: { cash: 0, online: 0, card: 0, gold: 0, receivedGram: 0 },
        previousBalance: 0,
        finalBalance: 0,
        advanceBalance: 0,
        status: 'ACTIVE',
        isDraft: true,
        settledBy: req.user?.name || req.user?.email || 'System',
        createdBy: req.user._id,
      });
    }

    const soldItem = {
      stockId: item.stockId,
      itemNumber: item.itemNumber,
      barcode: item.barcode,
      itemName: item.itemName,
      weight: item.weight,
      purity: item.purity,
      count: item.count,
      amount: parseFloat(item.amount) || 0,
    };
    const idx = draft.soldItems.findIndex(s => String(s.stockId) === String(item.stockId));
    if (idx >= 0) draft.soldItems[idx] = soldItem;
    else draft.soldItems.push(soldItem);

    await draft.save();
    res.json({ success: true, message: 'Sold product saved successfully', data: draft });
  } catch (error) {
    console.error('saveSoldItem error:', error);
    res.status(500).json({ success: false, message: 'Server error saving sold product' });
  }
};

// ─── Remove a Sold Product from the draft settlement ──────────────────────────
// Used when an item is reverted back to Pending after having been saved.
exports.deleteSoldItem = async (req, res) => {
  try {
    const { lineStockTransactionId, stockId } = req.params;
    const draft = await LineStockSettlement.findOne({ lineStockTransactionId, isDraft: true });
    if (!draft) {
      return res.json({ success: true, message: 'Nothing to remove' });
    }
    draft.soldItems = draft.soldItems.filter(s => String(s.stockId) !== String(stockId));
    if (draft.soldItems.length === 0 && draft.returnedItems.length === 0) {
      await LineStockSettlement.findByIdAndDelete(draft._id);
    } else {
      await draft.save();
    }
    res.json({ success: true, message: 'Sold product removed successfully' });
  } catch (error) {
    console.error('deleteSoldItem error:', error);
    res.status(500).json({ success: false, message: 'Server error removing sold product' });
  }
};

// ─── Get the in-progress draft settlement for a Line Stock transaction ───────
// Lets the settlement screen restore previously-saved Sold Products if the
// admin left mid-way and came back.
exports.getDraftSettlement = async (req, res) => {
  try {
    const { lineStockTransactionId } = req.params;
    const draft = await LineStockSettlement.findOne({ lineStockTransactionId, isDraft: true });
    res.json({ success: true, data: draft || null });
  } catch (error) {
    console.error('getDraftSettlement error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching draft settlement' });
  }
};

exports.getSettlementById = async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');

    let settlement = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      // Try to find directly
      settlement = await LineStockSettlement.findById(id)
        .populate('customerId')
        .populate('lineStockTransactionId');

      if (!settlement) {
        // It might be a Transaction ID (from history screen)
        const txn = await mongoose.model('Transaction').findById(id);
        if (txn && txn.transactionType === 'LINE_STOCK_SETTLEMENT' && txn.description) {
          const match = txn.description.match(/LSS\d{5}/);
          if (match) {
            settlement = await LineStockSettlement.findOne({ settlementNumber: match[0] })
              .populate('customerId')
              .populate('lineStockTransactionId');
          }
        }
      }
    }

    if (!settlement) {
      // Try treating ID as a settlementNumber
      settlement = await LineStockSettlement.findOne({ settlementNumber: id })
        .populate('customerId')
        .populate('lineStockTransactionId');
    }

    if (!settlement) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: settlement });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
