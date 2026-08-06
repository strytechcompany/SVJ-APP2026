const LineStockSettlement = require('../models/LineStockSettlement');
const LineStockTransaction = require('../models/LineStockTransaction');
const Stock = require('../models/Stock');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const cashLedgerController = require('./cashLedgerController');
const { computeWastageCashBalance } = require('../utils/wastageCashBalance');
const { restoreIssueWeights } = require('./stockMasterController');

exports.createSettlement = async (req, res) => {
  try {
    const {
      lineStockTransactionId,
      customerId,
      soldItems,
      returnedItems,
      paymentDetails,
      remarks,
      billStyle,
      plusBill,
      wastageBill,
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
    for (const item of returnedItems) {
      const stockItem = await Stock.findById(item.stockId);
      if (stockItem) {
        stockItem.quantity += item.count;
        stockItem.isAvailable = true;
        await stockItem.save();
      }
    }
    // Also add the returned weight back to the name-based Stock Master pool
    // (shared with B2C/B2D/Line Stock Issue). Sold items are NOT touched here
    // — they were already deducted at Issue time and must stay deducted.
    await restoreIssueWeights(returnedItems);

    let totalSoldWeight = 0;
    for (const item of soldItems) {
      totalSoldWeight += item.weight;
    }

    // Two-phase balance: Issue's "Save Bill" already provisionally committed
    // Previous + FULL Issued Weight (assuming everything would be sold).
    // Settlement now CORRECTS that using the real Sold/Return outcome —
    // recomputed from the ORIGINAL pre-issue snapshot frozen on the
    // transaction at Issue time (oldBalanceBefore/advanceBalanceBefore), not
    // from the customer's current (already-incremented) balance, otherwise
    // the issued weight would be double-counted. A fully-Returned item
    // contributes nothing (totalSoldWeight excludes it), so the balance ends
    // up back at exactly its original pre-issue value — a true no-op. An
    // existing Advance Balance is drawn down by what's actually sold,
    // converting to Old Balance only once fully consumed.
    const previousBalance = lsTransaction.oldBalanceBefore || 0;
    const previousAdvance = lsTransaction.advanceBalanceBefore || 0;
    let finalBalance, newAdvance;
    if (previousAdvance > 0 && previousBalance === 0) {
      const net = previousAdvance - totalSoldWeight;
      if (net < 0) { finalBalance = Math.abs(net); newAdvance = 0; }
      else { finalBalance = 0; newAdvance = net; }
    } else {
      const net = totalSoldWeight + previousBalance;
      if (net < 0) { finalBalance = 0; newAdvance = Math.abs(net); }
      else { finalBalance = net; newAdvance = 0; }
    }
    finalBalance = parseFloat(finalBalance.toFixed(3));
    newAdvance = parseFloat(newAdvance.toFixed(3));

    customer.oldBalance = finalBalance;
    customer.advance = newAdvance;
    await customer.save();

    const status = 'SETTLED';

    // Wastage Bill balance cash-conversion (first Save Bill from preview
    // mode) — same recompute as saveWastageBill, using the real pre-issue
    // snapshot (previousBalance/previousAdvance) as the source of truth.
    // Cash is always recomputed server-side, never trusted from the client.
    let sanitizedWastageBill = wastageBill;
    if (billStyle === 'WASTAGE' && wastageBill) {
      const issuedItems = (wastageBill.issuedItems || []).map((it) => {
        const weight = parseFloat(it.weight) || 0;
        const rate = parseFloat(it.rate) || 0;
        return {
          itemName: it.itemName || '',
          weight,
          wastage: parseFloat(it.wastage) || 0,
          rate,
          cash: parseFloat((weight * rate).toFixed(2)),
        };
      });
      const itemCash = parseFloat(issuedItems.reduce((s, i) => s + i.cash, 0).toFixed(2));
      const balanceRate = parseFloat(wastageBill.balanceRate) || 0;
      const { previousGram, previousCash, oldCash, advanceCash } = computeWastageCashBalance(
        previousBalance, previousAdvance, balanceRate, itemCash
      );
      sanitizedWastageBill = {
        issuedItems,
        receivedItems: [],
        balanceRate,
        previousBalanceGram: previousGram,
        previousBalanceCash: previousCash,
        currentOldBalanceCash: oldCash,
        currentAdvanceBalanceCash: advanceCash,
      };
    }

    // Reuse an existing draft settlement (built up via incremental Sold Product
    // saves) instead of creating a second document for the same transaction.
    let settlement = await LineStockSettlement.findOne({ lineStockTransactionId, isDraft: true });
    if (settlement) {
      settlement.soldItems = soldItems;
      settlement.returnedItems = returnedItems;
      settlement.paymentDetails = paymentDetails;
      settlement.previousBalance = previousBalance;
      settlement.advanceBalanceBefore = previousAdvance;
      settlement.finalBalance = finalBalance;
      settlement.advanceBalance = newAdvance;
      settlement.remarks = remarks;
      settlement.status = status;
      settlement.isDraft = false;
      if (billStyle !== undefined) settlement.billStyle = billStyle;
      if (plusBill !== undefined) settlement.plusBill = plusBill;
      if (sanitizedWastageBill !== undefined) settlement.wastageBill = sanitizedWastageBill;
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
        advanceBalanceBefore: previousAdvance,
        finalBalance,
        advanceBalance: newAdvance,
        remarks,
        status,
        isDraft: false,
        billStyle,
        plusBill,
        wastageBill: sanitizedWastageBill,
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

// ─── Update Bill Style (Plus/Wastage print layout) + Remarks ──────────────────
// Purely presentational — never touches stock, balance, or any saved
// calculation.
exports.updateBillStyle = async (req, res) => {
  try {
    const { billStyle, remarks } = req.body;
    if (billStyle !== undefined && billStyle !== null && !['PLUS', 'WASTAGE'].includes(billStyle)) {
      return res.status(400).json({ success: false, message: 'billStyle must be PLUS or WASTAGE' });
    }
    const settlement = await LineStockSettlement.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(billStyle !== undefined && { billStyle }),
          ...(remarks !== undefined && { remarks }),
        },
      },
      { new: true }
    );
    if (!settlement) {
      return res.status(404).json({ success: false, message: 'Settlement not found' });
    }
    res.json({ success: true, data: settlement });
  } catch (error) {
    console.error('updateBillStyle error:', error);
    res.status(500).json({ success: false, message: 'Server error updating bill style' });
  }
};

// ─── Save the PLUS Bill structure ─────────────────────────────────────────────
// A self-contained, gram-based bill view built on top of the real settlement.
// Purely additive — never itself touches soldItems, returnedItems,
// finalBalance, advanceBalance, or the real customer balance; the real
// balance was already corrected by createSettlement above.
exports.savePlusBill = async (req, res) => {
  try {
    const { plusBill } = req.body;
    if (!plusBill) {
      return res.status(400).json({ success: false, message: 'plusBill is required' });
    }
    const settlement = await LineStockSettlement.findByIdAndUpdate(
      req.params.id,
      { $set: { billStyle: 'PLUS', plusBill } },
      { new: true }
    ).populate('customerId').populate('lineStockTransactionId');
    if (!settlement) {
      return res.status(404).json({ success: false, message: 'Settlement not found' });
    }
    res.json({ success: true, data: settlement });
  } catch (error) {
    console.error('savePlusBill error:', error);
    res.status(500).json({ success: false, message: 'Server error saving plus bill' });
  }
};

// ─── Save the WASTAGE Bill structure ──────────────────────────────────────────
// A self-contained, cash-based bill view (Weight × manually-entered Rate =
// Cash for items; Balance Rate cash-conversion for the balance section).
// Same additive guarantee as savePlusBill — never touches the real gram
// balance. Cash is always recomputed server-side, never trusted from the
// client.
exports.saveWastageBill = async (req, res) => {
  try {
    const { wastageBill } = req.body;
    if (!wastageBill) {
      return res.status(400).json({ success: false, message: 'wastageBill is required' });
    }
    const settlement = await LineStockSettlement.findById(req.params.id);
    if (!settlement) {
      return res.status(404).json({ success: false, message: 'Settlement not found' });
    }

    const issuedItems = (wastageBill.issuedItems || []).map((it) => {
      const weight = parseFloat(it.weight) || 0;
      const rate = parseFloat(it.rate) || 0;
      return {
        itemName: it.itemName || '',
        weight,
        wastage: parseFloat(it.wastage) || 0,
        rate,
        cash: parseFloat((weight * rate).toFixed(2)),
      };
    });
    const itemCash = parseFloat(issuedItems.reduce((s, i) => s + i.cash, 0).toFixed(2));

    const balanceRate = parseFloat(wastageBill.balanceRate) || 0;
    const previousOldGram = settlement.previousBalance || 0;
    const previousAdvanceGram = settlement.advanceBalanceBefore || 0;
    const { previousGram, previousCash, oldCash, advanceCash } = computeWastageCashBalance(
      previousOldGram, previousAdvanceGram, balanceRate, itemCash
    );

    settlement.billStyle = 'WASTAGE';
    settlement.wastageBill = {
      issuedItems,
      receivedItems: [],
      balanceRate,
      previousBalanceGram: previousGram,
      previousBalanceCash: previousCash,
      currentOldBalanceCash: oldCash,
      currentAdvanceBalanceCash: advanceCash,
    };
    await settlement.save();
    await settlement.populate('customerId');
    await settlement.populate('lineStockTransactionId');

    res.json({ success: true, data: settlement });
  } catch (error) {
    console.error('saveWastageBill error:', error);
    res.status(500).json({ success: false, message: 'Server error saving wastage bill' });
  }
};

// ─── Get all Settlements for a Customer (newest first) ────────────────────────
// Used by CustomerDetailScreen.js's Bill History (Line Stock Bills category) to
// show settlement bills alongside Line Stock issue bills.
exports.getSettlementsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const settlements = await LineStockSettlement.find({ customerId, isDraft: { $ne: true } })
      .populate('lineStockTransactionId')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: settlements });
  } catch (error) {
    console.error('getSettlementsByCustomer error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching customer settlements' });
  }
};

// ─── Get the Settlement for a given Line Stock Transaction ────────────────────
// Used by the Line Stock Recent Transactions (Dashboard) list to jump straight
// to a settled transaction's settlement bill for editing.
exports.getSettlementByTransactionId = async (req, res) => {
  try {
    const { lineStockTransactionId } = req.params;
    const settlement = await LineStockSettlement.findOne({ lineStockTransactionId, isDraft: { $ne: true } })
      .populate('customerId')
      .populate('lineStockTransactionId');
    if (!settlement) {
      return res.status(404).json({ success: false, message: 'Settlement not found for this transaction' });
    }
    res.json({ success: true, data: settlement });
  } catch (error) {
    console.error('getSettlementByTransactionId error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching settlement' });
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
