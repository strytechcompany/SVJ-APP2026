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

    // Create Settlement Record
    const settlement = new LineStockSettlement({
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
      createdBy: req.user._id,
    });
    await settlement.save();

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
