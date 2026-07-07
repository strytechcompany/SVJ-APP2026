const Transaction = require('../models/Transaction');
const Stock = require('../models/Stock');
const Customer = require('../models/Customer');
const StockMovement = require('../models/StockMovement');
const ReceivedInventory = require('../models/ReceivedInventory');
const cashLedgerController = require('./cashLedgerController');

exports.createTransaction = async (req, res) => {
  try {
    const {
      transactionType,
      transactionSubtype,
      customerId,
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
      goldRate,
      description,
      paymentMode,
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

    // 1. Create the transaction
    const newTransaction = await Transaction.create({
      transactionType,
      transactionSubtype,
      customerId,
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
      goldRate,
      description,
      paymentMode,
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
    const transactions = await Transaction.find()
      .populate('customerId', 'customerName phoneNumber customerType')
      .sort({ createdAt: -1 })
      .limit(10);
    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('getRecentTransactions Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });

    const {
      newIssueItems, newReceiptItems,
      receiptTotalWeight: newReceiptTotalWeight, receiptTotalAmount: newReceiptTotalAmount,
      collectedAmount: newCollectedAmount,
      paymentMode: newPaymentMode, paymentDetails: newPaymentDetails,
      goldPaymentWeight: newGoldPaymentWeight, goldPaymentPurity: newGoldPaymentPurity,
      goldConvertedAmount: newGoldConvertedAmount, convertedGram: newConvertedGram,
    } = req.body;
    if (!Array.isArray(newIssueItems)) {
      return res.status(400).json({ success: false, message: 'newIssueItems must be an array' });
    }
    if (newReceiptItems !== undefined && !Array.isArray(newReceiptItems)) {
      return res.status(400).json({ success: false, message: 'newReceiptItems must be an array' });
    }

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
    const newIssueTotalWeight = parseFloat(newIssueItems.reduce((s, i) => s + (i.weight || 0), 0).toFixed(3));
    const newIssueTotalPurity = parseFloat(newIssueItems.reduce((s, i) => s + (i.purity || 0), 0).toFixed(3));
    const newIssueTotalAmount = parseFloat(newIssueItems.reduce((s, i) => s + (i.amount || 0), 0).toFixed(2));

    // Recalculate GST if it was active
    let newGstDetails = transaction.gstDetails?.toObject ? transaction.gstDetails.toObject() : transaction.gstDetails;
    let gstTotal = 0;
    if (transaction.gstDetails?.isOn) {
      const cgstAmount = parseFloat(((newIssueTotalAmount * (transaction.gstDetails.cgstPercent || 0)) / 100).toFixed(2));
      const sgstAmount = parseFloat(((newIssueTotalAmount * (transaction.gstDetails.sgstPercent || 0)) / 100).toFixed(2));
      gstTotal = cgstAmount + sgstAmount;
      newGstDetails = { ...newGstDetails, cgstAmount, sgstAmount };
    }

    const receiptTotal = newReceiptItems !== undefined
      ? (newReceiptTotalAmount || 0)
      : (transaction.receiptTotalAmount || 0);
    const collected = newCollectedAmount !== undefined ? newCollectedAmount : (transaction.collectedAmount || 0);
    const newFinalAmount = parseFloat((newIssueTotalAmount + gstTotal - receiptTotal).toFixed(2));
    const newOutstandingAmount = parseFloat(Math.max(0, newFinalAmount - collected).toFixed(2));
    const newOldBalanceAfter = parseFloat(((transaction.oldBalanceBefore || 0) + newOutstandingAmount).toFixed(2));

    // Delta for customer balance
    const balanceDelta = parseFloat((newOldBalanceAfter - (transaction.oldBalanceAfter || 0)).toFixed(2));
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
          issueItems: newIssueItems,
          issueTotalWeight: newIssueTotalWeight,
          issueTotalPurity: newIssueTotalPurity,
          issueTotalAmount: newIssueTotalAmount,
          ...(newReceiptItems !== undefined && {
            receiptItems: newReceiptItems,
            receiptTotalWeight: newReceiptTotalWeight || 0,
            receiptTotalAmount: newReceiptTotalAmount || 0,
          }),
          transactionSubtype: newSubtype,
          finalAmount: newFinalAmount,
          collectedAmount: collected,
          outstandingAmount: newOutstandingAmount,
          oldBalanceAfter: newOldBalanceAfter,
          gstDetails: newGstDetails,
          status: newOutstandingAmount <= 0 ? 'PAID' : 'PARTIAL',
          ...(newPaymentMode !== undefined && { paymentMode: newPaymentMode }),
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
    if (Math.abs(balanceDelta) > 0.001 || Math.abs(purchaseDelta) > 0.001) {
      await Customer.findByIdAndUpdate(transaction.customerId, {
        $inc: { oldBalance: balanceDelta, totalPurchaseAmount: purchaseDelta },
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
    const customerInc = {
      transactionCount: -1,
      totalPurchaseAmount: -(transaction.issueTotalAmount || 0),
      totalReceiptAmount: -(transaction.receiptTotalAmount || 0),
      oldBalance: -balanceImpact,
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
