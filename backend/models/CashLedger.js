const mongoose = require('mongoose');

const CashLedgerSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['IN', 'OUT', 'ADJUSTMENT', 'INITIAL_BALANCE'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    source: {
      type: String, // e.g. "B2B Sales", "B2C Sales", "Line Stock Settlement", "Chit Fund", "Daily Expense", "Manual Adjustment"
      required: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'referenceModel', // dynamically reference the appropriate model
    },
    referenceModel: {
      type: String,
      enum: ['Transaction', 'Settlement', 'Expense', 'ChitTransaction', 'ChitFundReceipt', 'LineStockSettlement', 'User'],
    },
    description: {
      type: String,
      trim: true,
    },
    balanceAfter: {
      type: Number, // Tracking running balance
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CashLedger', CashLedgerSchema);
