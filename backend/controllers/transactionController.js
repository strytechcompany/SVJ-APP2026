const Transaction = require('../models/Transaction');
const Stock = require('../models/Stock');
const Customer = require('../models/Customer');
const StockMovement = require('../models/StockMovement');
const ReceivedInventory = require('../models/ReceivedInventory');
const cashLedgerController = require('./cashLedgerController');
const { safeNumber } = require('../utils/safeNumber');

// Guards Cash fields (amount/rate on issue & receipt items) against Infinity/-Infinity/NaN
// before they ever reach MongoDB.
const sanitizeCashItems = (items) =>
  (items || []).map(item => ({
    ...item,
    ...(item.amount !== undefined && { amount: safeNumber(item.amount) }),
    ...(item.rate !== undefined && { rate: safeNumber(item.rate) }),
  }));

// Applies a signed delta (cash for Wastage, Pure grams for Plus) to a customer's
// Old Balance / Advance pair, auto-converting a sign flip instead of ever
// leaving either value negative:
//   Old Balance = Previous Old Balance + delta; if it goes negative, the
//   overflow becomes Advance instead.
//   If the customer currently holds an Advance instead, the delta is
//   subtracted from it; if that goes negative, the overflow becomes Old Balance.
const computeSignAwareBalance = (oldBefore, advanceBefore, delta) => {
  if (advanceBefore > 0 && oldBefore === 0) {
    const newAdvance = safeNumber(advanceBefore - delta);
    return newAdvance < 0
      ? { oldAfter: safeNumber(Math.abs(newAdvance)), advanceAfter: 0 }
      : { oldAfter: 0, advanceAfter: newAdvance };
  }
  const newOld = safeNumber(oldBefore + delta);
  return newOld < 0
    ? { oldAfter: 0, advanceAfter: safeNumber(advanceBefore + Math.abs(newOld)) }
    : { oldAfter: newOld, advanceAfter: advanceBefore };
};

// Remainder Table (Wastage's Subtraction Amount / Plus's Reminder Pure): an
// optional final adjustment subtracted from whichever balance is currently
// active, converting a sign flip instead of ever leaving either negative.
// A subtraction of 0 is a no-op (returns the balance unchanged).
const applyRemainderSubtraction = (oldBalance, advanceBalance, subtraction) => {
  if (advanceBalance > 0 && oldBalance === 0) {
    const bal = safeNumber(advanceBalance - subtraction);
    return bal < 0
      ? { oldBalance: safeNumber(Math.abs(bal)), advanceBalance: 0 }
      : { oldBalance: 0, advanceBalance: bal };
  }
  const bal = safeNumber(oldBalance - subtraction);
  return bal < 0
    ? { oldBalance: 0, advanceBalance: safeNumber(advanceBalance + Math.abs(bal)) }
    : { oldBalance: bal, advanceBalance: advanceBalance };
};

// Plus Final Summary's Outstanding: combines Issue/Receipt Pure with the
// Cash Table + Gram Table conversions (both treated as payments reducing
// what's owed) and whichever balance the customer currently holds.
const computePlusOutstanding = (issuePure, receiptPure, totalCash, totalGram, oldBefore, advanceBefore) => {
  if (advanceBefore > 0 && oldBefore === 0) {
    // Case 2: customer holds an Advance.
    const outstanding = safeNumber(issuePure - (advanceBefore + receiptPure + totalCash + totalGram));
    return outstanding < 0
      ? { outstanding, oldAfter: safeNumber(Math.abs(outstanding)), advanceAfter: 0 }
      : { outstanding, oldAfter: 0, advanceAfter: outstanding };
  }
  // Case 1: customer holds an Old Balance (or neither).
  const outstanding = safeNumber((issuePure + oldBefore) - (receiptPure + totalCash + totalGram));
  return outstanding < 0
    ? { outstanding, oldAfter: 0, advanceAfter: safeNumber(Math.abs(outstanding)) }
    : { outstanding, oldAfter: outstanding, advanceAfter: 0 };
};

// B2D Final Balance: gram-only ledger, no cash. Case 1 (customer holds an Old
// Balance, or neither): Final = (Old Balance + Receipt Gram) - Issue Gram.
// Case 2 (customer holds an Advance): Final = Receipt Gram - (Advance - Issue Gram).
// Either case auto-converts a sign flip instead of ever leaving the result negative.
const computeB2DBalance = (oldBefore, advanceBefore, issueGram, receiptGram) => {
  if (advanceBefore > 0 && oldBefore === 0) {
    const final = safeNumber(receiptGram - (advanceBefore - issueGram));
    return final < 0
      ? { oldAfter: safeNumber(Math.abs(final)), advanceAfter: 0 }
      : { oldAfter: 0, advanceAfter: final };
  }
  const final = safeNumber((oldBefore + receiptGram) - issueGram);
  return final < 0
    ? { oldAfter: 0, advanceAfter: safeNumber(Math.abs(final)) }
    : { oldAfter: final, advanceAfter: 0 };
};

// Reserves and returns the next number in the independent B2C Wastage (B2CW#)
// or Plus (B2CP#) bill sequence. Called once a new bill's category is known,
// before the bill is saved, so BillPreview can display the real number.
exports.getNextBillNumber = async (req, res) => {
  try {
    const { category } = req.query;
    if (!['WASTAGE', 'PLUS'].includes(category)) {
      return res.status(400).json({ success: false, message: 'category must be WASTAGE or PLUS' });
    }
    const billNo = await Transaction.generateB2CBillNumber(category);
    res.json({ success: true, data: { billNo } });
  } catch (error) {
    console.error('getNextBillNumber error:', error);
    res.status(500).json({ success: false, message: 'Server error generating bill number' });
  }
};

// Bills whose Remainder Table reminderDate has arrived (today or earlier) —
// shown on HomeScreen's "Upcoming Reminders" until the bill is settled/edited.
exports.getUpcomingReminders = async (req, res) => {
  try {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const reminders = await Transaction.find({
      reminderDate: { $ne: null, $lte: endOfToday },
    })
      .populate('customerId', 'customerName phoneNumber')
      .sort({ reminderDate: 1 });
    res.json({ success: true, data: reminders });
  } catch (error) {
    console.error('getUpcomingReminders error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching reminders' });
  }
};

exports.createTransaction = async (req, res) => {
  try {
    const {
      transactionType,
      transactionSubtype,
      customerId,
      commonBillNo,
      issueItems,
      receiptItems,
      paymentDetails,
      gstDetails,
      issueTotalWeight,
      issueTotalPurity,
      issueTotalAmount,
      receiptTotalWeight,
      receiptTotalPurity,
      receiptTotalAmount,
      finalAmount,
      balanceAmount,
      isWastage,
      wastageProfit,
      plusProfit,
      plusCashAmount,
      plusCashRate,
      plusFinalGram,
      plusCashRows,
      plusGramRows,
      plusTotalGram,
      plusOutstanding,
      wastageSubtractionAmount,
      plusReminderPure,
      reminderDate,
      goldRate,
      description,
      paymentMode,
      paymentOption,
      goldPaymentWeight,
      goldPaymentPurity,
      goldConvertedAmount,
      oldBalanceBefore,
      oldBalanceAfter,
      advanceBalanceBefore,
      advanceBalanceAfter,
      convertedGram,
      collectedAmount,
      outstandingAmount,
      outstandingGram,
      status,
    } = req.body;

    // Guard against duplicate bills — Bill Number is the unique identifier for a
    // saved bill. If a transaction with this exact commonBillNo already exists
    // (e.g. a retried request or a double-tap that slipped past the client-side
    // save lock), return it as-is instead of creating a second document and
    // re-applying stock/ledger/balance side effects a second time.
    if (commonBillNo) {
      const existingByBillNo = await Transaction.findOne({ commonBillNo });
      if (existingByBillNo) {
        return res.status(200).json({ success: true, data: existingByBillNo });
      }
    }

    // 1. Create the transaction
    const newTransaction = await Transaction.create({
      transactionType,
      transactionSubtype,
      customerId,
      commonBillNo,
      issueItems: sanitizeCashItems(issueItems),
      receiptItems: sanitizeCashItems(receiptItems),
      paymentDetails,
      gstDetails,
      issueTotalWeight,
      issueTotalPurity,
      issueTotalAmount: safeNumber(issueTotalAmount),
      receiptTotalWeight,
      receiptTotalPurity,
      receiptTotalAmount: safeNumber(receiptTotalAmount),
      finalAmount: safeNumber(finalAmount),
      balanceAmount,
      isWastage,
      wastageProfit,
      plusProfit,
      plusCashAmount,
      plusCashRate,
      plusFinalGram,
      plusCashRows,
      plusGramRows,
      plusTotalGram,
      plusOutstanding,
      wastageSubtractionAmount,
      plusReminderPure,
      reminderDate,
      goldRate,
      description,
      paymentMode,
      paymentOption,
      goldPaymentWeight,
      goldPaymentPurity,
      goldConvertedAmount,
      oldBalanceBefore,
      oldBalanceAfter: safeNumber(oldBalanceAfter),
      advanceBalanceBefore,
      advanceBalanceAfter,
      convertedGram,
      collectedAmount: safeNumber(collectedAmount),
      outstandingAmount: safeNumber(outstandingAmount),
      outstandingGram,
      status,
    });

    // 2. Update Stock quantities for issued items and Log Movements
    if (issueItems && issueItems.length > 0) {
      for (const item of issueItems) {
        if (item.stockId) {
          const countToDeduct = Math.abs(item.count || 1);

          // Snapshot stock BEFORE modifying so we can restore it later if deleted
          const stockRecord = await Stock.findById(item.stockId);
          const stockSnapshot = stockRecord ? stockRecord.toObject() : null;

          // Decrement stock quantity
          const updatedStock = await Stock.findByIdAndUpdate(
            item.stockId,
            { $inc: { quantity: -countToDeduct } },
            { new: true }
          );

          // Create Movement Log with snapshot for future restoration
          await StockMovement.create({
            stockId: item.stockId,
            transactionId: newTransaction._id,
            movementType: 'ISSUE',
            quantity: countToDeduct,
            weight: item.weight,
            customerId: customerId,
            customerType: transactionType,
            transactionType: transactionType,
            stockSnapshot,
          });

          // If stock hits 0, DELETE from Stock collection entirely
          if (updatedStock && updatedStock.quantity <= 0) {
            await Stock.findByIdAndDelete(item.stockId);
          }
        }
      }
    }

    // 2.5 Log Received Items separately into ReceivedInventory
    if (receiptItems && receiptItems.length > 0) {
      const receivedDocs = receiptItems.map(item => ({
        receiptNumber: item.billNo,
        customerId: customerId,
        transactionId: newTransaction._id,
        receiptType: item.receiptType,
        weight: item.weight,
        lessWeight: item.less,
        actualTouch: item.actualTouch,
        takenTouch: item.takenTouch,
        purity: item.purity,
        amount: item.amount,
        sriCost: item.sriCost,
        status: 'AVAILABLE'
      }));
      await ReceivedInventory.insertMany(receivedDocs);
    }

    // 2.6 Log Cash Payment to Cash Ledger
    if (paymentDetails && paymentDetails.mode === 'Cash' && paymentDetails.amount > 0) {
      await cashLedgerController.addLedgerEntry({
        type: 'IN',
        amount: paymentDetails.amount,
        source: `${transactionType} Cash Payment`,
        referenceId: newTransaction._id,
        referenceModel: 'Transaction',
        description: `Cash received during ${transactionType} transaction`,
        createdBy: req.user ? req.user._id : undefined
      });
    }

    // 3. Update Customer Balance and Date securely
    // We update the customer with the exact calculated values passed from the frontend engine
    // ensuring the before/after match what the user saw on the summary screen.
    const customerUpdate = { 
      lastTransactionDate: new Date() 
    };

    if (typeof oldBalanceAfter === 'number' && typeof advanceBalanceAfter === 'number') {
      customerUpdate.oldBalance = oldBalanceAfter;
      customerUpdate.advance = advanceBalanceAfter;
    }

    // Add incrementing fields for tracking
    const customerInc = {
      transactionCount: 1,
      totalPurchaseAmount: issueTotalAmount || 0,
      totalReceiptAmount: receiptTotalAmount || 0,
    };

    await Customer.findByIdAndUpdate(customerId, {
      $set: customerUpdate,
      $inc: customerInc
    });

    res.status(201).json({
      success: true,
      data: newTransaction,
    });
  } catch (error) {
    console.error('Create Transaction Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id).populate('customerId', 'customerName phoneNumber address customerType');
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('Get Transaction Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getTransactionsByCustomer = async (req, res) => {
  try {
    const transactions = await Transaction.find({ customerId: req.params.customerId })
      .populate('customerId', 'customerName phoneNumber')
      .lean();
      
    const Settlement = require('../models/Settlement');
    const settlements = await Settlement.find({ customerId: req.params.customerId })
      .populate('originalTransactionId', '_id')
      .lean();

    const history = [
      ...transactions.map(t => ({ ...t, historyType: 'BILL' })),
      ...settlements.map(s => ({ ...s, historyType: 'SETTLEMENT' }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Customer Transactions Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('customerId', 'customerName phoneNumber customerType')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('getAllTransactions Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getRecentTransactions = async (req, res) => {
  try {
    // Over-fetch and filter rather than .limit(10) directly — a hidden
    // ("Clear") record or a dangling customer reference must never eat one of
    // the 10 slots the admin actually sees.
    const candidates = await Transaction.find({ hiddenFromRecent: { $ne: true } })
      .populate('customerId', 'customerName phoneNumber customerType customerCategory oldBalance advance')
      .sort({ createdAt: -1 })
      .limit(40);
    const transactions = candidates.filter(t => t.customerId).slice(0, 10);
    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('getRecentTransactions Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Clear (hide) every transaction from the Recent Transactions feed ────────
// Never deletes anything — Bill History, Reports, and Stock all query
// Transaction without this flag, so they're completely unaffected.
exports.clearAllRecentTransactions = async (req, res) => {
  try {
    await Transaction.updateMany({}, { $set: { hiddenFromRecent: true } });
    res.json({ success: true, message: 'Recent Transactions cleared' });
  } catch (error) {
    console.error('clearAllRecentTransactions Error:', error);
    res.status(500).json({ success: false, message: 'Server error clearing recent transactions' });
  }
};

// ─── Clear (hide) a single transaction from the Recent Transactions feed ─────
exports.clearRecentTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      { $set: { hiddenFromRecent: true } },
      { new: true }
    );
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    res.json({ success: true, message: 'Transaction cleared from Recent Transactions' });
  } catch (error) {
    console.error('clearRecentTransaction Error:', error);
    res.status(500).json({ success: false, message: 'Server error clearing transaction' });
  }
};

exports.updateTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });

    const {
      newIssueItems, newReceiptItems, newWastageProfit, newPlusProfit,
      plusCashAmount: newPlusCashAmount, plusCashRate: newPlusCashRate, plusFinalGram: newPlusFinalGram,
      plusCashRows: newPlusCashRows, plusGramRows: newPlusGramRows, plusTotalGram: newPlusTotalGram,
      wastageSubtractionAmount: newWastageSubtractionAmount, plusReminderPure: newPlusReminderPure,
      reminderDate: newReminderDate,
      receiptTotalWeight: newReceiptTotalWeight, receiptTotalAmount: newReceiptTotalAmount,
      collectedAmount: newCollectedAmount,
      paymentMode: newPaymentMode, paymentDetails: newPaymentDetails,
      paymentOption: newPaymentOption,
      goldPaymentWeight: newGoldPaymentWeight, goldPaymentPurity: newGoldPaymentPurity,
      goldConvertedAmount: newGoldConvertedAmount, convertedGram: newConvertedGram,
    } = req.body;
    if (!Array.isArray(newIssueItems)) {
      return res.status(400).json({ success: false, message: 'newIssueItems must be an array' });
    }
    if (newReceiptItems !== undefined && !Array.isArray(newReceiptItems)) {
      return res.status(400).json({ success: false, message: 'newReceiptItems must be an array' });
    }

    // Guard Cash fields (amount/rate) against Infinity/-Infinity/NaN before any downstream math or save.
    const sanitizedNewIssueItems = sanitizeCashItems(newIssueItems);
    const sanitizedNewReceiptItems = newReceiptItems !== undefined ? sanitizeCashItems(newReceiptItems) : undefined;

    // Build maps keyed by stockId string for comparison
    const oldMap = new Map();
    for (const item of transaction.issueItems) {
      if (item.stockId) oldMap.set(item.stockId.toString(), item);
    }
    const newMap = new Map();
    for (const item of newIssueItems) {
      if (item.stockId) newMap.set(item.stockId.toString(), item);
    }

    // Reconcile stock changes
    for (const [stockId, oldItem] of oldMap) {
      const oldCount = oldItem.count || 1;
      const newItem = newMap.get(stockId);
      const newCount = newItem ? (newItem.count || 1) : 0;
      const diff = oldCount - newCount;

      if (diff > 0) {
        // Items removed or count reduced — restore to stock
        // Read snapshot now (before movements are deleted below)
        const movement = await StockMovement.findOne({
          transactionId: transaction._id, stockId, movementType: 'ISSUE',
        });
        const existingStock = await Stock.findById(stockId);
        if (existingStock) {
          await Stock.findByIdAndUpdate(stockId, { $inc: { quantity: diff } });
          await Stock.findByIdAndUpdate(stockId, { $set: { isAvailable: true } });
        } else if (movement?.stockSnapshot) {
          // Stock was deleted when issued — recreate from snapshot
          const { _id, __v, createdAt, updatedAt, ...snap } = movement.stockSnapshot;
          await new Stock({ ...snap, _id: stockId, quantity: diff, isAvailable: true }).save();
        }
      } else if (diff < 0) {
        // Count increased — deduct additional from stock
        const additional = Math.abs(diff);
        const stock = await Stock.findById(stockId);
        if (!stock || stock.quantity < additional) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${oldItem.itemName || oldItem.itemNumber}`,
          });
        }
        const updated = await Stock.findByIdAndUpdate(
          stockId, { $inc: { quantity: -additional } }, { new: true }
        );
        if (updated && updated.quantity <= 0) {
          await Stock.findByIdAndDelete(stockId);
        }
      }
    }

    // Recalculate totals from new items
    const newIssueTotalWeight = parseFloat(sanitizedNewIssueItems.reduce((s, i) => s + (i.weight || 0), 0).toFixed(3));
    const newIssueTotalPurity = parseFloat(sanitizedNewIssueItems.reduce((s, i) => s + (i.purity || 0), 0).toFixed(3));
    const newIssueTotalAmount = safeNumber(parseFloat(sanitizedNewIssueItems.reduce((s, i) => s + safeNumber(i.amount), 0).toFixed(2)));

    // Recalculate GST if it was active
    let newGstDetails = transaction.gstDetails?.toObject ? transaction.gstDetails.toObject() : transaction.gstDetails;
    let gstTotal = 0;
    if (transaction.gstDetails?.isOn) {
      const cgstAmount = parseFloat(((newIssueTotalAmount * (transaction.gstDetails.cgstPercent || 0)) / 100).toFixed(2));
      const sgstAmount = parseFloat(((newIssueTotalAmount * (transaction.gstDetails.sgstPercent || 0)) / 100).toFixed(2));
      gstTotal = cgstAmount + sgstAmount;
      newGstDetails = { ...newGstDetails, cgstAmount, sgstAmount };
    }

    const receiptTotal = safeNumber(newReceiptItems !== undefined
      ? (newReceiptTotalAmount || 0)
      : (transaction.receiptTotalAmount || 0));
    let collected = safeNumber(newCollectedAmount !== undefined ? newCollectedAmount : (transaction.collectedAmount || 0));
    const newFinalAmount = safeNumber(parseFloat((newIssueTotalAmount + gstTotal - receiptTotal).toFixed(2)));

    // Plus bills (B2C, not Wastage) settle in Pure grams via Old Balance/Advance — Case 1/2/3.
    // Wastage bills settle via an explicit Collect Cash / Add to Balance choice (direct ₹, no gold-rate conversion).
    // Every other flow settles in cash via the generic outstanding-amount math below.
    const isPlusBill = transaction.transactionType === 'B2C' && !transaction.isWastage;
    const isWastageBillWithPaymentOption = transaction.isWastage && !!newPaymentOption;
    const isB2DBill = transaction.transactionType === 'B2D';
    const effectiveReceiptItemsForPurity = sanitizedNewReceiptItems !== undefined ? sanitizedNewReceiptItems : (transaction.receiptItems || []);
    const newReceiptTotalPurity = parseFloat(effectiveReceiptItemsForPurity.reduce((s, i) => s + (i.purity || 0), 0).toFixed(3));
    const newGramOutstanding = parseFloat((newIssueTotalPurity - newReceiptTotalPurity).toFixed(3));

    let newOutstandingAmount, newOldBalanceAfter, newAdvanceBalanceAfter, balanceDelta, advanceDelta;
    // Plus: Total Cash (Cash Table's Final Gram sum) and Total Gram (Gram Table sum)
    // both treated as payments reducing what's owed, combined with the Issue/Receipt
    // Pure difference into the Outstanding formula.
    const newPlusTotalCash = safeNumber(newPlusFinalGram);
    const newPlusTotalGramVal = safeNumber(newPlusTotalGram);
    let newPlusOutstanding;
    // Wastage: Final Cash mirrors the manually-entered/collected Amount directly
    // (confirmed business rule) — it no longer nets against Issue/Receipt totals.
    const wastagePreCollected = collected;
    const newWastageNetFinalCash = safeNumber(wastagePreCollected);

    if (isPlusBill) {
      const outcome = computePlusOutstanding(
        newIssueTotalPurity, newReceiptTotalPurity, newPlusTotalCash, newPlusTotalGramVal,
        safeNumber(transaction.oldBalanceBefore || 0), safeNumber(transaction.advanceBalanceBefore || 0)
      );
      newPlusOutstanding = outcome.outstanding;
      // Remainder Table (optional): Reminder Pure further reduces whichever
      // balance the Outstanding calc just landed on.
      const remainder = applyRemainderSubtraction(outcome.oldAfter, outcome.advanceAfter, safeNumber(newPlusReminderPure));
      newOldBalanceAfter = remainder.oldBalance;
      newAdvanceBalanceAfter = remainder.advanceBalance;
      newOutstandingAmount = 0;
      balanceDelta = parseFloat((newOldBalanceAfter - (transaction.oldBalanceAfter || 0)).toFixed(3));
      advanceDelta = parseFloat((newAdvanceBalanceAfter - (transaction.advanceBalanceAfter || 0)).toFixed(3));
    } else if (isWastageBillWithPaymentOption) {
      if (newPaymentOption === 'COLLECT_CASH') {
        collected = newFinalAmount;
        newOutstandingAmount = 0;
        newOldBalanceAfter = 0;
        newAdvanceBalanceAfter = safeNumber(transaction.advanceBalanceBefore || 0);
      } else {
        // ADD_TO_BALANCE: only the net Final Cash (after any up-front collection)
        // flows into the balance, with automatic Old Balance <-> Advance conversion.
        collected = wastagePreCollected;
        newOutstandingAmount = Math.max(0, newWastageNetFinalCash);
        const bal = computeSignAwareBalance(
          safeNumber(transaction.oldBalanceBefore || 0),
          safeNumber(transaction.advanceBalanceBefore || 0),
          newWastageNetFinalCash
        );
        // Remainder Table (optional): Subtraction Amount further reduces
        // whichever balance the Add-to-Balance decision just landed on.
        const remainder = applyRemainderSubtraction(bal.oldAfter, bal.advanceAfter, safeNumber(newWastageSubtractionAmount));
        newOldBalanceAfter = remainder.oldBalance;
        newAdvanceBalanceAfter = remainder.advanceBalance;
      }
      balanceDelta = parseFloat((newOldBalanceAfter - (transaction.oldBalanceAfter || 0)).toFixed(2));
      advanceDelta = parseFloat((newAdvanceBalanceAfter - (transaction.advanceBalanceAfter || 0)).toFixed(2));
    } else if (isB2DBill) {
      // Gram-only ledger, Case 1/2 with automatic Old Balance <-> Advance conversion.
      const bal = computeB2DBalance(
        safeNumber(transaction.oldBalanceBefore || 0),
        safeNumber(transaction.advanceBalanceBefore || 0),
        newIssueTotalPurity,
        newReceiptTotalPurity
      );
      newOldBalanceAfter = bal.oldAfter;
      newAdvanceBalanceAfter = bal.advanceAfter;
      newOutstandingAmount = 0;
      balanceDelta = parseFloat((newOldBalanceAfter - (transaction.oldBalanceAfter || 0)).toFixed(3));
      advanceDelta = parseFloat((newAdvanceBalanceAfter - (transaction.advanceBalanceAfter || 0)).toFixed(3));
    } else {
      newOutstandingAmount = safeNumber(parseFloat(Math.max(0, newFinalAmount - collected).toFixed(2)));
      newOldBalanceAfter = safeNumber(parseFloat(((transaction.oldBalanceBefore || 0) + newOutstandingAmount).toFixed(2)));
      newAdvanceBalanceAfter = transaction.advanceBalanceAfter;
      balanceDelta = parseFloat((newOldBalanceAfter - (transaction.oldBalanceAfter || 0)).toFixed(2));
      advanceDelta = 0;
    }

    const newStatus = isPlusBill
      ? (newOldBalanceAfter > 0 ? 'PARTIAL' : 'PAID')
      : isWastageBillWithPaymentOption
      ? (newPaymentOption === 'COLLECT_CASH' ? 'PAID' : 'PARTIAL')
      : isB2DBill
      ? (newOldBalanceAfter > 0 ? 'PARTIAL' : 'PAID')
      : (newOutstandingAmount <= 0 ? 'PAID' : 'PARTIAL');

    // Delta for customer balance
    const purchaseDelta = parseFloat((newIssueTotalAmount - (transaction.issueTotalAmount || 0)).toFixed(2));

    // Recompute transactionSubtype to reflect the new item mix
    const hasIssue = newIssueItems.length > 0;
    const effectiveReceiptItems = newReceiptItems !== undefined ? newReceiptItems : transaction.receiptItems;
    const hasReceipt = (effectiveReceiptItems || []).length > 0;
    const hasPayment = collected > 0;
    let newSubtype = transaction.transactionSubtype;
    if (hasIssue && !hasReceipt && !hasPayment) newSubtype = 'ISSUE_ONLY';
    else if (!hasIssue && hasReceipt && !hasPayment) newSubtype = 'RECEIPT_ONLY';
    else if (!hasIssue && !hasReceipt && hasPayment) newSubtype = 'PAYMENT_ONLY';
    else if (hasIssue && hasReceipt && !hasPayment) newSubtype = 'ISSUE_RECEIPT';
    else if (hasIssue && !hasReceipt && hasPayment) newSubtype = 'ISSUE_PAYMENT';
    else if (!hasIssue && hasReceipt && hasPayment) newSubtype = 'RECEIPT_PAYMENT';
    else if (hasIssue && hasReceipt && hasPayment) newSubtype = 'FULL_TRANSACTION';

    const updatedTxn = await Transaction.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          issueItems: sanitizedNewIssueItems,
          issueTotalWeight: newIssueTotalWeight,
          issueTotalPurity: newIssueTotalPurity,
          issueTotalAmount: newIssueTotalAmount,
          ...(sanitizedNewReceiptItems !== undefined && {
            receiptItems: sanitizedNewReceiptItems,
            receiptTotalWeight: newReceiptTotalWeight || 0,
            receiptTotalAmount: safeNumber(newReceiptTotalAmount || 0),
          }),
          receiptTotalPurity: newReceiptTotalPurity,
          ...(newWastageProfit !== undefined && { wastageProfit: newWastageProfit }),
          ...(newPlusProfit !== undefined && { plusProfit: newPlusProfit }),
          ...(newPlusCashAmount !== undefined && { plusCashAmount: newPlusCashAmount }),
          ...(newPlusCashRate !== undefined && { plusCashRate: newPlusCashRate }),
          ...(newPlusFinalGram !== undefined && { plusFinalGram: newPlusFinalGram }),
          ...(newPlusCashRows !== undefined && { plusCashRows: newPlusCashRows }),
          ...(newPlusGramRows !== undefined && { plusGramRows: newPlusGramRows }),
          ...(newPlusTotalGram !== undefined && { plusTotalGram: newPlusTotalGramVal }),
          ...(isPlusBill && { plusOutstanding: newPlusOutstanding }),
          ...(newWastageSubtractionAmount !== undefined && { wastageSubtractionAmount: safeNumber(newWastageSubtractionAmount) }),
          ...(newPlusReminderPure !== undefined && { plusReminderPure: safeNumber(newPlusReminderPure) }),
          ...(newReminderDate !== undefined && { reminderDate: newReminderDate }),
          transactionSubtype: newSubtype,
          finalAmount: newFinalAmount,
          collectedAmount: collected,
          outstandingAmount: newOutstandingAmount,
          oldBalanceAfter: newOldBalanceAfter,
          advanceBalanceAfter: newAdvanceBalanceAfter,
          gstDetails: newGstDetails,
          status: newStatus,
          ...(newPaymentMode !== undefined && { paymentMode: newPaymentMode }),
          ...(newPaymentOption !== undefined && { paymentOption: newPaymentOption }),
          ...(newPaymentDetails !== undefined && { paymentDetails: newPaymentDetails }),
          ...(newGoldPaymentWeight !== undefined && { goldPaymentWeight: newGoldPaymentWeight }),
          ...(newGoldPaymentPurity !== undefined && { goldPaymentPurity: newGoldPaymentPurity }),
          ...(newGoldConvertedAmount !== undefined && { goldConvertedAmount: newGoldConvertedAmount }),
          ...(newConvertedGram !== undefined && { convertedGram: newConvertedGram }),
        },
      },
      { new: true }
    );

    // Apply delta to customer
    if (Math.abs(balanceDelta) > 0.001 || Math.abs(advanceDelta) > 0.001 || Math.abs(purchaseDelta) > 0.001) {
      await Customer.findByIdAndUpdate(transaction.customerId, {
        $inc: { oldBalance: balanceDelta, advance: advanceDelta, totalPurchaseAmount: purchaseDelta },
      });
    }

    // Refresh stock movement logs for this transaction
    await StockMovement.deleteMany({ transactionId: transaction._id, movementType: 'ISSUE' });
    for (const item of newIssueItems) {
      if (item.stockId) {
        const stockRecord = await Stock.findById(item.stockId);
        await StockMovement.create({
          stockId: item.stockId,
          transactionId: transaction._id,
          movementType: 'ISSUE',
          quantity: item.count || 1,
          weight: item.weight,
          customerId: transaction.customerId,
          transactionType: transaction.transactionType,
          stockSnapshot: stockRecord ? stockRecord.toObject() : null,
        });
      }
    }

    res.json({ success: true, data: updatedTxn });
  } catch (error) {
    console.error('updateTransaction Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });

    // 1. Restore all issued stock (stock may have been deleted at issue time)
    for (const item of transaction.issueItems) {
      if (item.stockId && item.count) {
        const existingStock = await Stock.findById(item.stockId);
        if (existingStock) {
          await Stock.findByIdAndUpdate(item.stockId, { $inc: { quantity: item.count } });
          await Stock.findByIdAndUpdate(item.stockId, { $set: { isAvailable: true } });
        } else {
          // Stock was deleted when issued — restore from StockMovement snapshot
          const movement = await StockMovement.findOne({
            transactionId: transaction._id, stockId: item.stockId, movementType: 'ISSUE',
          });
          if (movement?.stockSnapshot) {
            const { _id, __v, createdAt, updatedAt, ...snap } = movement.stockSnapshot;
            await new Stock({ ...snap, _id: item.stockId, quantity: item.count, isAvailable: true }).save();
          }
        }
      }
    }

    // 2. Delete movement logs and received inventory for this transaction
    await StockMovement.deleteMany({ transactionId: transaction._id });
    await ReceivedInventory.deleteMany({ transactionId: transaction._id });

    // 3. Reverse this transaction's impact on customer balance
    const balanceImpact = parseFloat(((transaction.oldBalanceAfter || 0) - (transaction.oldBalanceBefore || 0)).toFixed(2));
    const advanceImpact = parseFloat(((transaction.advanceBalanceAfter || 0) - (transaction.advanceBalanceBefore || 0)).toFixed(2));
    const customerInc = {
      transactionCount: -1,
      totalPurchaseAmount: -(transaction.issueTotalAmount || 0),
      totalReceiptAmount: -(transaction.receiptTotalAmount || 0),
      oldBalance: -balanceImpact,
      advance: -advanceImpact,
    };
    await Customer.findByIdAndUpdate(transaction.customerId, { $inc: customerInc });

    // 4. Update lastTransactionDate to the previous transaction's date
    const prevTxn = await Transaction.findOne({
      customerId: transaction.customerId,
      _id: { $ne: transaction._id },
    }).sort({ createdAt: -1 });
    if (prevTxn) {
      await Customer.findByIdAndUpdate(transaction.customerId, {
        $set: { lastTransactionDate: prevTxn.createdAt },
      });
    }

    // 5. Delete the transaction
    await Transaction.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Bill deleted and stock restored successfully' });
  } catch (error) {
    console.error('deleteTransaction Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.markPrinted = async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      { $inc: { printedCount: 1 }, $set: { lastPrintedAt: new Date() } },
      { new: true }
    );
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('markPrinted Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
