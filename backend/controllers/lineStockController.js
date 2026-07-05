const LineStockTransaction = require('../models/LineStockTransaction');
const Customer = require('../models/Customer');
const Stock = require('../models/Stock');

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
