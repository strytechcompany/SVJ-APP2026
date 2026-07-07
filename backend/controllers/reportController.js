const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Stock = require('../models/Stock');
const Customer = require('../models/Customer');
const Expense = require('../models/Expense');
const ChitTransaction = require('../models/ChitTransaction');
const LineStockTransaction = require('../models/LineStockTransaction');
const CashLedger = require('../models/CashLedger');

exports.getReportData = async (req, res) => {
  try {
    const { mode, date, month, year } = req.query;

    let startDate, endDate;

    if (mode === 'TODAY') {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (mode === 'CUSTOM_DATE' && date) {
      const d = new Date(date);
      startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      endDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    } else if (mode === 'MONTHLY' && month && year) {
      startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      endDate = new Date(parseInt(year), parseInt(month), 1);
    } else {
      // Default to today
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    }

    const dateFilter = { $gte: startDate, $lt: endDate };

    // 1. Live Stock & Cash Summary
    const stockStats = await Stock.aggregate([
      { $match: { isActive: true, isAvailable: { $ne: false } } },
      { $group: { _id: null, totalItems: { $sum: "$quantity" }, totalWeight: { $sum: { $multiply: ["$netWeight", "$quantity"] } } } }
    ]);
    const totalStockItems = stockStats[0] ? stockStats[0].totalItems : 0;
    const totalStockWeight = stockStats[0] ? stockStats[0].totalWeight : 0;

    const lastCashEntry = await CashLedger.findOne().sort({ createdAt: -1 });
    const currentCashAmount = lastCashEntry ? lastCashEntry.balanceAfter : 0;

    const totalSalesCount = await Transaction.countDocuments({
      createdAt: dateFilter,
      transactionType: { $in: ['B2C', 'B2D'] }
    });

    // 2. Customer Sales Table (Itemized) — B2C (Plus & Wastage) and B2D issued items
    const customerSalesAgg = await Transaction.aggregate([
      { $match: { createdAt: dateFilter, transactionType: { $in: ['B2C', 'B2D'] } } },
      { $unwind: "$issueItems" },
      { $lookup: { from: "customers", localField: "customerId", foreignField: "_id", as: "customer" } },
      { $unwind: "$customer" },
      { $project: {
          customerName: "$customer.customerName",
          phoneNumber: "$customer.phoneNumber",
          date: "$createdAt",
          billNumber: "$issueItems.billNo",
          itemName: "$issueItems.itemName",
          weight: "$issueItems.weight",
          sriCost: "$issueItems.sriCost",
          sriBill: "$issueItems.sriBill",
          sriPlus: "$issueItems.plus",
          source: {
            $cond: [
              { $eq: ["$transactionType", "B2D"] },
              "B2D",
              { $cond: [{ $eq: ["$isWastage", true] }, "B2C-WASTAGE", "B2C-PLUS"] }
            ]
          }
        }
      },
      { $sort: { date: -1 } }
    ]);

    // 2b. Line Stocker issued items also count as "customer sales" issues
    const lineStockerSalesAgg = await LineStockTransaction.aggregate([
      { $match: { issueDate: dateFilter } },
      { $unwind: "$issuedProducts" },
      { $lookup: { from: "customers", localField: "customerId", foreignField: "_id", as: "customer" } },
      { $unwind: "$customer" },
      { $project: {
          customerName: "$customer.customerName",
          phoneNumber: "$customer.phoneNumber",
          date: "$issueDate",
          billNumber: "$issuedProducts.billNo",
          itemName: "$issuedProducts.itemName",
          weight: "$issuedProducts.weight",
          sriCost: { $literal: null },
          sriBill: { $literal: null },
          sriPlus: { $literal: null },
          source: { $literal: "LINE_STOCKER" }
        }
      },
      { $sort: { date: -1 } }
    ]);

    // Combined itemized sales across every channel that issues stock to a customer
    const combinedCustomerSales = [...customerSalesAgg, ...lineStockerSalesAgg]
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // 3. Plus Summary Table — genuine PLUS-category B2C sales only (excludes B2D & WASTAGE issues)
    const plusSummaryAgg = await Transaction.aggregate([
      { $match: { createdAt: dateFilter, transactionType: 'B2C', isWastage: { $ne: true } } },
      { $unwind: "$issueItems" },
      { $group: {
          _id: "$issueItems.plus",
          totalWeight: { $sum: "$issueItems.weight" }
        }
      },
      { $project: {
          plus: "$_id",
          totalWeight: 1,
          profit: { $multiply: ["$totalWeight", { $divide: ["$_id", 100] }] }
        }
      },
      { $sort: { plus: -1 } }
    ]);

    // 3b. Wastage Summary Table — from items issued to WASTAGE-category B2C customers
    const wastageSummaryAgg = await Transaction.aggregate([
      { $match: { createdAt: dateFilter, transactionType: 'B2C', isWastage: true } },
      { $unwind: "$issueItems" },
      { $group: {
          _id: "$issueItems.wastage",
          totalWeight: { $sum: "$issueItems.weight" },
          profit: { $sum: "$issueItems.profit" }
        }
      },
      { $project: {
          wastage: "$_id",
          totalWeight: 1,
          profit: 1
        }
      },
      { $sort: { wastage: -1 } }
    ]);

    // 4. Debt Payable (Advance > 0)
    const debtPayable = await Customer.find({ advance: { $gt: 0 } })
      .select('customerName phoneNumber advance')
      .sort({ advance: -1 });

    // 5. Debt Receivable (Old Balance > 0)
    const debtReceivable = await Customer.find({ oldBalance: { $gt: 0 } })
      .select('customerName phoneNumber oldBalance')
      .sort({ oldBalance: -1 });

    // 6. Expenses
    const expenses = await Expense.find({ expenseDate: dateFilter })
      .sort({ expenseDate: -1 });

    // 7. Chit Funds (Transactions within date filter)
    const chitFunds = await ChitTransaction.find({ paymentDate: dateFilter })
      .populate('customerId', 'customerName phoneNumber')
      .sort({ paymentDate: -1 });

    // 8. Line Stock Report
    const lineStockTransactions = await LineStockTransaction.find({ issueDate: dateFilter })
      .populate('customerId', 'customerName phoneNumber')
      .sort({ issueDate: -1 });

    // Add extra Line Stock details calculation:
    // We need Total Issued, Total Returned, Total Sold, Outstanding Gram.
    // The schema provides totalGram (issued). The outstanding is `outstandingGram`? 
    // Wait, LineStockTransaction has `issuedProducts` but the returned/sold are tracked elsewhere?
    // Actually, LineStockSettlement tracks returned/sold. For a complete picture we will format the raw transactions here.

    const formattedLineStock = lineStockTransactions.map(tx => {
      return {
        customerName: tx.customerId?.customerName || 'Unknown',
        phoneNumber: tx.customerId?.phoneNumber || '',
        issueDate: tx.issueDate,
        expectedReturnDate: tx.expectedReturnDate,
        totalIssuedGram: tx.totalGram || 0,
        status: tx.status,
      };
    });

    res.json({
      success: true,
      data: {
        summaryCards: {
          totalStockItems,
          totalStockWeight,
          totalSalesCount,
          currentCashAmount
        },
        customerSales: combinedCustomerSales,
        plusSummary: plusSummaryAgg,
        wastageSummary: wastageSummaryAgg,
        debtPayable,
        debtReceivable,
        expenses,
        chitFunds,
        lineStock: formattedLineStock
      }
    });

  } catch (error) {
    console.error('getReportData error:', error);
    res.status(500).json({ success: false, message: 'Server error generating reports' });
  }
};
