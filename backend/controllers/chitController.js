const ChitCustomer = require('../models/ChitCustomer');
const ChitTransaction = require('../models/ChitTransaction');
const cashLedgerController = require('./cashLedgerController');

// Create a new Chit Customer
exports.createChitCustomer = async (req, res) => {
  try {
    const {
      customerName,
      phoneNumber,
      address,
      durationMonths,
      monthlyAmount,
      startDate,
      endDate,
    } = req.body;

    const newCustomer = await ChitCustomer.create({
      customerName,
      phoneNumber,
      address,
      durationMonths,
      monthlyAmount,
      startDate,
      endDate,
      status: 'ACTIVE',
    });

    res.status(201).json({ success: true, data: newCustomer });
  } catch (error) {
    console.error('Error creating Chit Customer:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get all Chit Customers with optional status filter
exports.getChitCustomers = async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { chitId: { $regex: search, $options: 'i' } },
      ];
    }

    const customers = await ChitCustomer.find(query).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: customers });
  } catch (error) {
    console.error('Error fetching Chit Customers:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Pay an installment
exports.payInstallment = async (req, res) => {
  try {
    const { chitId } = req.params;
    const { amount, goldRate, paymentDate, paymentMode } = req.body;

    const customer = await ChitCustomer.findOne({ chitId });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (customer.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Chit is already completed' });
    }

    if (customer.completedMonths >= customer.durationMonths) {
      return res.status(400).json({ success: false, message: 'All installments already paid' });
    }

    const purchasedWeight = Number((amount / goldRate).toFixed(4));
    const previousWeight = customer.totalWeightAccumulated || 0;
    const runningWeight = previousWeight + purchasedWeight;
    const installmentNumber = customer.completedMonths + 1;

    // Create Transaction
    const transaction = await ChitTransaction.create({
      chitId,
      customerId: customer._id,
      installmentNumber,
      totalInstallments: customer.durationMonths,
      amount,
      goldRate,
      purchasedWeight,
      previousWeight,
      runningWeight,
      paymentDate: new Date(paymentDate || Date.now()),
      paymentMode: paymentMode || 'Cash',
    });

    // Update Customer
    const completedMonths = customer.completedMonths + 1;
    const status = completedMonths >= customer.durationMonths ? 'COMPLETED' : 'ACTIVE';
    
    customer.completedMonths = completedMonths;
    customer.totalWeightAccumulated = runningWeight;
    customer.status = status;
    await customer.save();

    // Log Cash Payment to Cash Ledger (non-fatal — payment already committed above)
    if (!paymentMode || paymentMode.toLowerCase() === 'cash') {
      try {
        await cashLedgerController.addLedgerEntry({
          type: 'IN',
          amount,
          source: 'Chit Fund Collection',
          referenceId: transaction._id,
          referenceModel: 'ChitTransaction',
          description: `Chit Fund installment ${installmentNumber} for ${chitId}`,
          createdBy: req.user?.name || req.user?.email || 'System'
        });
      } catch (ledgerErr) {
        console.error('Ledger entry failed (payment still saved):', ledgerErr.message);
      }
    }

    res.status(201).json({ success: true, data: transaction, customer });
  } catch (error) {
    console.error('Error processing Chit Payment:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get specific Chit Transactions
exports.getChitTransactions = async (req, res) => {
  try {
    const { chitId } = req.params;
    const transactions = await ChitTransaction.find({ chitId }).sort({ installmentNumber: 1 });
    res.status(200).json({ success: true, data: transactions });
  } catch (error) {
    console.error('Error fetching Chit Transactions:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get ALL Chit Transactions (for the global Transactions screen)
exports.getAllChitTransactions = async (_req, res) => {
  try {
    const transactions = await ChitTransaction.find()
      .populate('customerId', 'customerName phoneNumber address chitId')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: transactions });
  } catch (error) {
    console.error('Error fetching ALL Chit Transactions:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Increment printed count and optionally save PDF URL
exports.markReceiptPrinted = async (req, res) => {
  try {
    const { receiptId } = req.params;
    const { pdfUrl } = req.body;

    const updateData = { $inc: { printedCount: 1 } };
    if (pdfUrl) {
      updateData.$set = { pdfUrl };
    }

    const transaction = await ChitTransaction.findByIdAndUpdate(
      receiptId,
      updateData,
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }

    res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    console.error('Error updating receipt printed status:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
