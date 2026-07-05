const Settlement = require('../models/Settlement');
const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const cashLedgerController = require('./cashLedgerController');

exports.createSettlement = async (req, res) => {
  try {
    const {
      originalTransactionId,
      customerId,
      paymentMode,
      amountPaid,
      goldRateAtSettlement,
      description
    } = req.body;

    // 1. Fetch Original Transaction
    const originalTxn = await Transaction.findById(originalTransactionId);
    if (!originalTxn) {
      return res.status(404).json({ success: false, message: 'Original Transaction not found' });
    }

    const round2 = (n) => Math.round(n * 100) / 100;
    if (round2(originalTxn.outstandingAmount) <= 0) {
      return res.status(400).json({ success: false, message: 'Transaction is already fully paid.' });
    }

    // 2. Calculate New Balances (round to 2 decimal places to eliminate floating-point drift)
    const outstandingBefore = round2(originalTxn.outstandingAmount);
    const paidAmt = round2(Number(amountPaid));
    const outstandingAfter = round2(Math.max(0, outstandingBefore - paidAmt));
    const gramSettled = goldRateAtSettlement ? (paidAmt / goldRateAtSettlement) : 0;

    const newOutstandingGram = Math.max(0, originalTxn.outstandingGram - gramSettled);

    // 3. Generate Settlement Bill Number (e.g., SET-TxnId-Count)
    const settlementCount = await Settlement.countDocuments({ originalTransactionId });
    const shortId = originalTxn._id.toString().slice(-6).toUpperCase();
    const settlementBillNumber = `SET-${shortId}-${(settlementCount + 1).toString().padStart(2, '0')}`;

    // 4. Create Settlement Record
    const newSettlement = await Settlement.create({
      originalTransactionId,
      originalBillNumber: shortId,
      settlementBillNumber,
      customerId,
      paymentMode,
      amountPaid: paidAmt,
      goldRateAtSettlement,
      gramSettled,
      outstandingBefore,
      outstandingAfter,
      description
    });

    // 5. Update Original Transaction
    originalTxn.outstandingAmount = outstandingAfter;
    originalTxn.outstandingGram = newOutstandingGram;
    originalTxn.collectedAmount = round2((originalTxn.collectedAmount || 0) + paidAmt);
    originalTxn.status = outstandingAfter > 0 ? 'PARTIAL' : 'PAID';
    await originalTxn.save();

    // 6. Update Customer Global Balance
    // A settlement reduces the customer's old balance
    const customer = await Customer.findById(customerId);
    if (customer) {
      let newOldBalance = round2(customer.oldBalance - paidAmt);
      let newAdvance = customer.advance;

      if (newOldBalance < 0) {
        newAdvance += Math.abs(newOldBalance);
        newOldBalance = 0;
      }

      await Customer.findByIdAndUpdate(customerId, {
        $set: { oldBalance: newOldBalance, advance: newAdvance }
      });
    }

    // 7. Log Cash to Cash Ledger
    if (paymentMode === 'Cash') {
      await cashLedgerController.addLedgerEntry({
        type: 'IN',
        amount: paidAmt,
        source: 'Bill Settlement',
        referenceId: newSettlement._id,
        referenceModel: 'Settlement', // Wait, Settlement schema doesn't exist in the list but we can pass string
        description: `Cash received for bill settlement ${settlementBillNumber}`,
        createdBy: req.user ? req.user._id : undefined
      });
    }

    res.status(201).json({ success: true, data: newSettlement });
  } catch (error) {
    console.error('Create Settlement Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getSettlementsByBill = async (req, res) => {
  try {
    const settlements = await Settlement.find({ originalTransactionId: req.params.billId })
      .populate('customerId', 'customerName phoneNumber')
      .sort({ createdAt: 1 });
    res.json({ success: true, data: settlements });
  } catch (error) {
    console.error('getSettlementsByBill Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getSettlementById = async (req, res) => {
  try {
    const settlement = await Settlement.findById(req.params.id)
      .populate('customerId', 'customerName phoneNumber address');
    if (!settlement) {
      return res.status(404).json({ success: false, message: 'Settlement not found' });
    }
    res.json({ success: true, data: settlement });
  } catch (error) {
    console.error('getSettlementById Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
