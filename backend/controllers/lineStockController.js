const LineStockTransaction = require('../models/LineStockTransaction');
const LineStockSettlement = require('../models/LineStockSettlement');
const Customer = require('../models/Customer');
const Stock = require('../models/Stock');
const Transaction = require('../models/Transaction');
const CashLedger = require('../models/CashLedger');
const { validateIssueWeights, deductIssueWeights, restoreIssueWeights } = require('./stockMasterController');

// ─── Get Dashboard Summary ────────────────────────────────────────────────────
exports.getDashboardSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const activeCount = await LineStockTransaction.countDocuments({ status: 'ACTIVE' });
    const overdueCount = await LineStockTransaction.countDocuments({
      status: 'ACTIVE',
      expectedReturnDate: { $lt: today },
    });
    const completedCount = await LineStockTransaction.countDocuments({ status: 'SETTLED' });
    const issuedTodayCount = await LineStockTransaction.countDocuments({
      issueDate: { $gte: today, $lt: tomorrow },
    });

    res.json({
      success: true,
      data: {
        active: activeCount,
        overdue: overdueCount,
        completed: completedCount,
        issuedToday: issuedTodayCount,
      },
    });
  } catch (error) {
    console.error('getDashboardSummary error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching summary' });
  }
};

// ─── Get All Line Stock Transactions ──────────────────────────────────────────
exports.getTransactions = async (req, res) => {
  try {
    const { status = 'All', search = '', page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (status !== 'All') {
      if (status === 'OVERDUE') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query.status = 'ACTIVE';
        query.expectedReturnDate = { $lt: today };
      } else {
        query.status = status;
      }
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      const customers = await Customer.find({
        $or: [{ customerName: regex }, { phoneNumber: regex }, { customerCode: regex }],
      }).select('_id');
      const customerIds = customers.map(c => c._id);
      
      query.$or = [
        { transactionNumber: regex },
        { customerId: { $in: customerIds } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await LineStockTransaction.countDocuments(query);

    const transactions = await LineStockTransaction.find(query)
      .sort({ issueDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('customerId', 'customerName phoneNumber address oldBalance advance');

    res.json({
      success: true,
      data: transactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('getTransactions error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching transactions' });
  }
};

// ─── Get Single Transaction By ID ─────────────────────────────────────────────
exports.getTransactionById = async (req, res) => {
  try {
    const transaction = await LineStockTransaction.findById(req.params.id)
      .populate('customerId')
      .populate('issuedProducts.stockId');

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('getTransactionById error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Issue Line Stock ─────────────────────────────────────────────────────────
exports.issueStock = async (req, res) => {
  try {
    const { customerId, issueDate, expectedReturnDate, issuedProducts, description } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (!issuedProducts || issuedProducts.length === 0) {
      return res.status(400).json({ success: false, message: 'No products selected for issue' });
    }

    // Phase 1: validate stock availability and fetch all stock docs (no writes yet)
    let totalGram = 0;
    let totalItems = 0;
    const stockUpdates = [];

    for (const item of issuedProducts) {
      const stock = await Stock.findById(item.stockId);
      if (!stock || stock.quantity < item.count) {
        return res.status(400).json({ success: false, message: `Insufficient stock for item ${item.itemName}` });
      }
      stockUpdates.push({ stock, count: item.count });
      totalGram += parseFloat(item.weight);
      totalItems += parseInt(item.count);
    }

    // Also validate against the name-based Stock Master pool (shared with
    // B2C Plus/Wastage and B2D) BEFORE any writes — an issued item's weight
    // is matched by Item Name, same as everywhere else.
    const stockMasterCheck = await validateIssueWeights(issuedProducts);
    if (!stockMasterCheck.ok) {
      return res.status(400).json({ success: false, message: stockMasterCheck.message });
    }

    // Before/After here is a PROJECTION only — "if this bill is saved as-is,
    // this is what the balance would become". The real commit happens on
    // "Save Bill" (PLUS style, see updateBillStyle below) or when a Wastage
    // bill is chosen. Case 1 (Old Balance active): Current Old = Previous Old
    // + Issued. Case 2 (Advance active): Current Advance = Previous Advance -
    // Issued; if that goes negative, it converts to Old Balance = the
    // absolute value (never both non-zero at once).
    const oldBalanceBefore = customer.oldBalance;
    const advanceBalanceBefore = customer.advance;
    let oldBalanceAfter, advanceBalanceAfter;
    if (advanceBalanceBefore > 0 && oldBalanceBefore === 0) {
      const net = totalGram - advanceBalanceBefore;
      if (net < 0) { advanceBalanceAfter = Math.abs(net); oldBalanceAfter = 0; }
      else { advanceBalanceAfter = 0; oldBalanceAfter = net; }
    } else {
      const net = totalGram + oldBalanceBefore;
      if (net < 0) { oldBalanceAfter = 0; advanceBalanceAfter = Math.abs(net); }
      else { oldBalanceAfter = net; advanceBalanceAfter = 0; }
    }
    oldBalanceAfter = parseFloat(oldBalanceAfter.toFixed(3));
    advanceBalanceAfter = parseFloat(advanceBalanceAfter.toFixed(3));

    // Phase 2: validate transaction document before touching any stock/customer
    const transaction = new LineStockTransaction({
      customerId,
      issueDate: issueDate || new Date(),
      expectedReturnDate,
      totalItems,
      totalGram,
      oldBalanceBefore,
      oldBalanceAfter,
      advanceBalanceBefore,
      advanceBalanceAfter,
      description,
      issuedProducts,
      status: 'ACTIVE',
      issuedBy: req.user.name || req.user.email,
      createdBy: req.user._id,
    });

    await transaction.validate();

    // Phase 3: all checks passed — now write stock and the transaction.
    // Customer balance is untouched here (see comment above).
    for (const { stock, count } of stockUpdates) {
      stock.quantity -= count;
      if (stock.quantity === 0) stock.isAvailable = false;
      await stock.save();
    }
    await deductIssueWeights(issuedProducts);

    await transaction.save();

    res.status(201).json({
      success: true,
      message: 'Line Stock Issued Successfully',
      data: transaction,
    });
  } catch (error) {
    console.error('issueStock error:', error);
    res.status(500).json({ success: false, message: 'Server error issuing stock' });
  }
};

// ─── Update Bill Style (Plus/Wastage print layout) + Notes ────────────────────
// For a PLUS-style bill, this is also the real "Save Bill" — the ONE place
// the customer's balance actually changes for a Line Stock issue (Settlement
// no longer touches it). Always reads the customer's LIVE balance from
// MongoDB (never a cached/stale value) and applies it exactly once per
// transaction (balanceApplied guards against a repeat Save Bill re-adding it).
exports.updateBillStyle = async (req, res) => {
  try {
    const { billStyle, description } = req.body;
    if (billStyle !== undefined && billStyle !== null && !['PLUS', 'WASTAGE'].includes(billStyle)) {
      return res.status(400).json({ success: false, message: 'billStyle must be PLUS or WASTAGE' });
    }

    const transaction = await LineStockTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (billStyle === 'PLUS' && !transaction.balanceApplied) {
      const customer = await Customer.findById(transaction.customerId);
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }

      const previousOldBalance = customer.oldBalance;
      const previousAdvanceBalance = customer.advance;
      let oldBalanceAfter, advanceBalanceAfter;
      if (previousAdvanceBalance > 0 && previousOldBalance === 0) {
        const net = transaction.totalGram - previousAdvanceBalance;
        if (net < 0) { advanceBalanceAfter = Math.abs(net); oldBalanceAfter = 0; }
        else { advanceBalanceAfter = 0; oldBalanceAfter = net; }
      } else {
        const net = transaction.totalGram + previousOldBalance;
        if (net < 0) { oldBalanceAfter = 0; advanceBalanceAfter = Math.abs(net); }
        else { oldBalanceAfter = net; advanceBalanceAfter = 0; }
      }
      oldBalanceAfter = parseFloat(oldBalanceAfter.toFixed(3));
      advanceBalanceAfter = parseFloat(advanceBalanceAfter.toFixed(3));

      customer.oldBalance = oldBalanceAfter;
      customer.advance = advanceBalanceAfter;
      await customer.save();

      transaction.oldBalanceBefore = previousOldBalance;
      transaction.oldBalanceAfter = oldBalanceAfter;
      transaction.advanceBalanceBefore = previousAdvanceBalance;
      transaction.advanceBalanceAfter = advanceBalanceAfter;
      transaction.balanceApplied = true;
    }

    if (billStyle !== undefined) transaction.billStyle = billStyle;
    if (description !== undefined) transaction.description = description;
    await transaction.save();

    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('updateBillStyle error:', error);
    res.status(500).json({ success: false, message: 'Server error updating bill style' });
  }
};

// ─── Save the WASTAGE Bill structure ──────────────────────────────────────────
// A self-contained, cash-based bill view built on top of the real (gram-only)
// Line Stock issue — purely additive. Never touches issuedProducts, totalGram,
// stock, or the real oldBalanceBefore/After ledger fields; the numbers here
// are frontend-computed (same pattern as B2C Wastage bills) and just persisted
// as given for display/print/reopen purposes.
exports.saveWastageBill = async (req, res) => {
  try {
    const { wastageBill } = req.body;
    if (!wastageBill) {
      return res.status(400).json({ success: false, message: 'wastageBill is required' });
    }

    const existing = await LineStockTransaction.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    // Generate the Bill No once (same B2CW# sequence used by real B2C Wastage
    // bills) — reopening/editing keeps the original number, never regenerates.
    const billNo = existing.wastageBill?.billNo || await Transaction.generateB2CBillNumber('WASTAGE');

    const transaction = await LineStockTransaction.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          billStyle: 'WASTAGE',
          wastageBill: { ...wastageBill, billNo },
        },
      },
      { new: true }
    );
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('saveWastageBill error:', error);
    res.status(500).json({ success: false, message: 'Server error saving wastage bill' });
  }
};

// ─── Update Line Stock Transaction ────────────────────────────────────────────
// Editing is only allowed while ACTIVE — a SETTLED transaction already has a
// linked LineStockSettlement (and customer balance changes) computed against
// its original issuedProducts, so changing them afterwards would corrupt that
// settlement's numbers.
exports.updateTransaction = async (req, res) => {
  try {
    const transaction = await LineStockTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    if (transaction.status === 'SETTLED') {
      return res.status(400).json({ success: false, message: 'This transaction is already settled and cannot be edited, to protect stock and balance history.' });
    }

    const { expectedReturnDate, issuedProducts: newIssuedProducts, description } = req.body;
    if (!Array.isArray(newIssuedProducts) || newIssuedProducts.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide at least one issued product.' });
    }

    const customer = await Customer.findById(transaction.customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Reconcile stock: restore items removed/reduced, deduct items added/increased.
    const oldMap = new Map();
    for (const item of transaction.issuedProducts) {
      if (item.stockId) oldMap.set(item.stockId.toString(), item);
    }
    const newMap = new Map();
    for (const item of newIssuedProducts) {
      if (item.stockId) newMap.set(item.stockId.toString(), item);
    }

    for (const [stockId, oldItem] of oldMap) {
      const oldCount = oldItem.count || 1;
      const newItem = newMap.get(stockId);
      const newCount = newItem ? (newItem.count || 1) : 0;
      const diff = oldCount - newCount;
      if (diff > 0) {
        await Stock.findByIdAndUpdate(stockId, { $inc: { quantity: diff }, $set: { isAvailable: true } });
      } else if (diff < 0) {
        const additional = Math.abs(diff);
        const stock = await Stock.findById(stockId);
        if (!stock || stock.quantity < additional) {
          return res.status(400).json({ success: false, message: `Insufficient stock for ${oldItem.itemName || oldItem.itemNumber}` });
        }
        const updated = await Stock.findByIdAndUpdate(stockId, { $inc: { quantity: -additional } }, { new: true });
        if (updated && updated.quantity <= 0) {
          await Stock.findByIdAndUpdate(stockId, { $set: { isAvailable: false } });
        }
      }
    }
    for (const [stockId, newItem] of newMap) {
      if (!oldMap.has(stockId)) {
        const additional = newItem.count || 1;
        const stock = await Stock.findById(stockId);
        if (!stock || stock.quantity < additional) {
          return res.status(400).json({ success: false, message: `Insufficient stock for ${newItem.itemName || newItem.itemNumber}` });
        }
        const updated = await Stock.findByIdAndUpdate(stockId, { $inc: { quantity: -additional } }, { new: true });
        if (updated && updated.quantity <= 0) {
          await Stock.findByIdAndUpdate(stockId, { $set: { isAvailable: false } });
        }
      }
    }

    // Reconcile Stock Master (name-based) the same way — net per-name delta
    // validated BEFORE anything is written, then restore-old/deduct-new.
    {
      const oldByName = new Map();
      for (const it of transaction.issuedProducts || []) {
        const name = String(it.itemName || '').trim().toLowerCase();
        if (!name) continue;
        oldByName.set(name, (oldByName.get(name) || 0) + (parseFloat(it.weight) || 0));
      }
      const newByName = new Map();
      for (const it of newIssuedProducts) {
        const name = String(it.itemName || '').trim().toLowerCase();
        if (!name) continue;
        newByName.set(name, (newByName.get(name) || 0) + (parseFloat(it.weight) || 0));
      }
      const allNames = new Set([...oldByName.keys(), ...newByName.keys()]);
      for (const name of allNames) {
        const delta = (newByName.get(name) || 0) - (oldByName.get(name) || 0);
        if (delta > 0) {
          const StockMaster = require('../models/StockMaster');
          const stock = await StockMaster.findOne({ itemNameLower: name });
          const available = stock ? stock.totalWeight : 0;
          if (delta > available + 1e-6) {
            return res.status(400).json({ success: false, message: 'Insufficient Stock Available' });
          }
        }
      }
      await restoreIssueWeights(transaction.issuedProducts);
      await deductIssueWeights(newIssuedProducts);
    }

    const newTotalItems = newIssuedProducts.reduce((s, i) => s + (parseInt(i.count) || 1), 0);
    const newTotalGram = parseFloat(newIssuedProducts.reduce((s, i) => s + (parseFloat(i.weight) || 0), 0).toFixed(3));

    // Before Save Bill, this is a PROJECTION only, recomputed off this
    // transaction's own Before snapshot. Once Save Bill has already committed
    // it to the customer (balanceApplied), an edit here must keep the real
    // balance in sync: undo the old commit (restore Before), then reapply
    // with the updated totalGram — same mutual-exclusive formula throughout.
    const oldBalanceBefore = transaction.oldBalanceBefore || 0;
    const advanceBalanceBefore = transaction.advanceBalanceBefore || 0;
    let oldBalanceAfter, advanceBalanceAfter;
    if (advanceBalanceBefore > 0 && oldBalanceBefore === 0) {
      const net = newTotalGram - advanceBalanceBefore;
      if (net < 0) { advanceBalanceAfter = Math.abs(net); oldBalanceAfter = 0; }
      else { advanceBalanceAfter = 0; oldBalanceAfter = net; }
    } else {
      const net = newTotalGram + oldBalanceBefore;
      if (net < 0) { oldBalanceAfter = 0; advanceBalanceAfter = Math.abs(net); }
      else { oldBalanceAfter = net; advanceBalanceAfter = 0; }
    }
    oldBalanceAfter = parseFloat(oldBalanceAfter.toFixed(3));
    advanceBalanceAfter = parseFloat(advanceBalanceAfter.toFixed(3));

    if (transaction.balanceApplied) {
      customer.oldBalance = oldBalanceAfter;
      customer.advance = advanceBalanceAfter;
      await customer.save();
    }

    transaction.issuedProducts = newIssuedProducts;
    transaction.totalItems = newTotalItems;
    transaction.totalGram = newTotalGram;
    transaction.oldBalanceAfter = parseFloat(oldBalanceAfter.toFixed(3));
    transaction.advanceBalanceAfter = parseFloat(advanceBalanceAfter.toFixed(3));
    if (expectedReturnDate) transaction.expectedReturnDate = expectedReturnDate;
    if (description !== undefined) transaction.description = description;

    await transaction.save();

    res.json({ success: true, message: 'Line Stock Transaction Updated Successfully', data: transaction });
  } catch (error) {
    console.error('updateTransaction error:', error);
    res.status(500).json({ success: false, message: 'Server error updating transaction' });
  }
};

// ─── Delete Line Stock Transaction ────────────────────────────────────────────
exports.deleteTransaction = async (req, res) => {
  try {
    const transaction = await LineStockTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    if (transaction.status === 'SETTLED') {
      return res.status(400).json({ success: false, message: 'This transaction is already settled and cannot be deleted, to protect stock and balance history.' });
    }

    // Restore stock for every issued item
    for (const item of transaction.issuedProducts) {
      if (item.stockId) {
        await Stock.findByIdAndUpdate(item.stockId, {
          $inc: { quantity: item.count || 1 },
          $set: { isAvailable: true },
        });
      }
    }
    await restoreIssueWeights(transaction.issuedProducts);

    // Reverse this transaction's impact on the customer's old balance only
    if (transaction.totalGram) {
      await Customer.findByIdAndUpdate(transaction.customerId, {
        $inc: { oldBalance: -transaction.totalGram },
      });
    }

    await LineStockTransaction.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Line Stock Transaction Deleted Successfully' });
  } catch (error) {
    console.error('deleteTransaction error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting transaction' });
  }
};

// ─── Clear ALL Line Stock Transactions (destructive bulk reset) ──────────────
// ACTIVE transactions: restore all issued stock (nothing was ever settled).
// SETTLED transactions: only restore sold items' stock — returned items were
// already restored back to stock at settlement time, so redoing that here
// would double-count them.
// Customer oldBalance/advance is reset to 0 only for LINE_STOCKER customers,
// since once every Line Stock record is gone there is no remaining history to
// preserve a partial balance against.
exports.clearAllTransactions = async (req, res) => {
  try {
    const transactions = await LineStockTransaction.find();

    for (const txn of transactions) {
      if (txn.status === 'SETTLED') {
        const settlement = await LineStockSettlement.findOne({ lineStockTransactionId: txn._id });
        for (const item of (settlement && settlement.soldItems) || []) {
          if (item.stockId) {
            await Stock.findByIdAndUpdate(item.stockId, {
              $inc: { quantity: item.count || 1 },
              $set: { isAvailable: true },
            });
          }
        }
        // Sold items only — returned items were already restored to Stock
        // Master at settlement time, redoing that here would double-count.
        await restoreIssueWeights(settlement?.soldItems || []);
      } else {
        for (const item of txn.issuedProducts || []) {
          if (item.stockId) {
            await Stock.findByIdAndUpdate(item.stockId, {
              $inc: { quantity: item.count || 1 },
              $set: { isAvailable: true },
            });
          }
        }
        await restoreIssueWeights(txn.issuedProducts || []);
      }
    }

    await Customer.updateMany({ customerType: 'LINE_STOCKER' }, { $set: { oldBalance: 0, advance: 0 } });

    await LineStockSettlement.deleteMany({});
    await Transaction.deleteMany({ transactionType: 'LINE_STOCK_SETTLEMENT' });

    const hadCashLedgerEntries = (await CashLedger.countDocuments({ referenceModel: 'LineStockSettlement' })) > 0;
    await CashLedger.deleteMany({ referenceModel: 'LineStockSettlement' });

    const deletedCount = transactions.length;
    await LineStockTransaction.deleteMany({});

    // Recompute the running balanceAfter chain for whatever CashLedger entries remain,
    // since deleting entries out of order leaves stale running balances behind them.
    if (hadCashLedgerEntries) {
      const remaining = await CashLedger.find().sort({ createdAt: 1, _id: 1 });
      let running = 0;
      for (const entry of remaining) {
        if (entry.type === 'IN' || entry.type === 'INITIAL_BALANCE') {
          running += entry.amount;
        } else if (entry.type === 'OUT') {
          running -= entry.amount;
        } else if (entry.type === 'ADJUSTMENT') {
          running = entry.amount;
        }
        if (entry.balanceAfter !== running) {
          entry.balanceAfter = running;
          await entry.save();
        }
      }
    }

    res.json({
      success: true,
      message: `Cleared ${deletedCount} Line Stock transaction(s) successfully`,
    });
  } catch (error) {
    console.error('clearAllTransactions error:', error);
    res.status(500).json({ success: false, message: 'Server error clearing transactions' });
  }
};
