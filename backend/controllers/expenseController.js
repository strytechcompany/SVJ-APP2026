const Expense = require('../models/Expense');
const cashLedgerController = require('./cashLedgerController');

// Create a new expense
exports.createExpense = async (req, res) => {
  try {
    const { expenseName, expenseDate, expenseType, amount, notes } = req.body;

    const expense = await Expense.create({
      expenseName,
      expenseDate,
      expenseType,
      amount: Number(amount),
      notes,
      createdBy: req.user?.name || req.user?.email || 'Unknown',
    });

    // Log Cash Outflow to Cash Ledger
    if (Number(amount) > 0) {
      await cashLedgerController.addLedgerEntry({
        type: 'OUT',
        amount: Number(amount),
        source: `Expense - ${expenseType}`,
        referenceId: expense._id,
        referenceModel: 'Expense',
        description: expenseName,
        createdBy: req.user?.name || req.user?.email || 'Unknown'
      });
    }

    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all expenses with optional filtering
exports.getAllExpenses = async (req, res) => {
  try {
    const { type, filter, search } = req.query;
    
    let query = {};
    
    // Type Filter
    if (type && type !== 'All') {
      query.expenseType = type;
    }
    
    // Date Filter (Daily, Monthly, Current Month, Current Year)
    const now = new Date();
    if (filter === 'Current Month') {
      query.expenseDate = {
        $gte: new Date(now.getFullYear(), now.getMonth(), 1),
        $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    } else if (filter === 'Current Year') {
      query.expenseDate = {
        $gte: new Date(now.getFullYear(), 0, 1),
        $lt: new Date(now.getFullYear() + 1, 0, 1),
      };
    }

    // Search
    if (search) {
      query.expenseName = { $regex: search, $options: 'i' };
    }

    const expenses = await Expense.find(query)
      .sort({ expenseDate: -1, createdAt: -1 });

    res.json({ success: true, data: expenses });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single expense
exports.getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update expense
exports.updateExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name');

    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete expense
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get expense summary
exports.getExpenseSummary = async (req, res) => {
  try {
    const now = new Date();
    
    // Today
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    // This Month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    // This Year
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear() + 1, 0, 1);

    const [todayAgg, monthAgg, yearAgg] = await Promise.all([
      Expense.aggregate([
        { $match: { expenseDate: { $gte: startOfToday, $lt: endOfToday } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Expense.aggregate([
        { $match: { expenseDate: { $gte: startOfMonth, $lt: endOfMonth } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Expense.aggregate([
        { $match: { expenseDate: { $gte: startOfYear, $lt: endOfYear } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);

    const todayTotal = todayAgg[0]?.total || 0;
    const monthTotal = monthAgg[0]?.total || 0;
    const yearTotal = yearAgg[0]?.total || 0;

    res.json({
      success: true,
      data: {
        todayTotal,
        monthTotal,
        yearTotal
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
