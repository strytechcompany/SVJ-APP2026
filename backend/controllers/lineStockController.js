const LineStockTransaction = require('../models/LineStockTransaction');
const LineStockSettlement = require('../models/LineStockSettlement');
const Customer = require('../models/Customer');
const Stock = require('../models/Stock');
const Transaction = require('../models/Transaction');
const CashLedger = require('../models/CashLedger');

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

    const oldBalanceBefore = customer.oldBalance;
    const oldBalanceAfter = oldBalanceBefore + totalGram;

    // Phase 2: validate transaction document before touching any stock/customer
    const transaction = new LineStockTransaction({
      customerId,
      issueDate: issueDate || new Date(),
      expectedReturnDate,
      totalItems,
      totalGram,
      oldBalanceBefore,
      oldBalanceAfter,
      description,
      issuedProducts,
      status: 'ACTIVE',
      issuedBy: req.user.name || req.user.email,
      createdBy: req.user._id,
    });

    await transaction.validate();

    // Phase 3: all checks passed — now write stock, customer, transaction
    for (const { stock, count } of stockUpdates) {
      stock.quantity -= count;
      if (stock.quantity === 0) stock.isAvailable = false;
      await stock.save();
    }

    customer.oldBalance = oldBalanceAfter;
    await customer.save();

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

    const newTotalItems = newIssuedProducts.reduce((s, i) => s + (parseInt(i.count) || 1), 0);
    const newTotalGram = parseFloat(newIssuedProducts.reduce((s, i) => s + (parseFloat(i.weight) || 0), 0).toFixed(3));

    // Delta-based balance adjustment — preserves any other changes made to the
    // customer's balance since this transaction was first issued.
    const balanceDelta = parseFloat((newTotalGram - (transaction.totalGram || 0)).toFixed(3));
    if (Math.abs(balanceDelta) > 0.0001) {
      await Customer.findByIdAndUpdate(transaction.customerId, { $inc: { oldBalance: balanceDelta } });
    }

    transaction.issuedProducts = newIssuedProducts;
    transaction.totalItems = newTotalItems;
    transaction.totalGram = newTotalGram;
    transaction.oldBalanceAfter = parseFloat(((transaction.oldBalanceBefore || 0) + newTotalGram).toFixed(3));
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
      } else {
        for (const item of txn.issuedProducts || []) {
          if (item.stockId) {
            await Stock.findByIdAndUpdate(item.stockId, {
              $inc: { quantity: item.count || 1 },
              $set: { isAvailable: true },
            });
          }
        }
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
