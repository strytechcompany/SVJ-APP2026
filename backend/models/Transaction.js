const mongoose = require('mongoose');

const IssueItemSchema = new mongoose.Schema({
  stockId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stock',
  },
  billNo: String,
  itemNumber: String,
  itemName: String,
  weight: Number,
  count: Number,
  sriCost: Number,
  sriBill: Number,
  plus: Number,
  purity: Number,
  amount: Number,
});

const ReceiptItemSchema = new mongoose.Schema({
  billNo: String,
  receiptType: String,
  weight: Number,
  less: Number,
  actualTouch: Number,
  takenTouch: Number,
  purity: Number,
  amount: Number,
});

const PaymentDetailsSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: ['Cash', 'Online Payment', 'Card', 'Debt', 'Gold'],
  },
  subMode: String, // GPay, Debit Card, etc.
  amount: Number,
});

const GSTDetailsSchema = new mongoose.Schema({
  isOn: Boolean,
  cgstPercent: Number,
  sgstPercent: Number,
  cgstAmount: Number,
  sgstAmount: Number,
});

const TransactionSchema = new mongoose.Schema(
  {
    transactionType: {
      type: String,
      enum: ['B2B', 'B2C', 'LINE_STOCK_SETTLEMENT'],
      required: true,
    },
    transactionSubtype: {
      type: String,
      enum: ['ISSUE_ONLY', 'RECEIPT_ONLY', 'PAYMENT_ONLY', 'ISSUE_RECEIPT', 'ISSUE_PAYMENT', 'RECEIPT_PAYMENT', 'FULL_TRANSACTION'],
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    issueItems: [IssueItemSchema],
    receiptItems: [ReceiptItemSchema],
    paymentDetails: PaymentDetailsSchema,
    gstDetails: GSTDetailsSchema,

    issueTotalWeight: Number,
    issueTotalPurity: Number,
    issueTotalAmount: Number,

    receiptTotalWeight: Number,
    receiptTotalPurity: Number,
    receiptTotalAmount: Number,

    finalAmount: Number,
    balanceAmount: Number,
    
    // For storing gold rate at the time of transaction
    goldRate: Number,

    // Advanced Payment Tracking
    description: String,
    paymentMode: String,
    goldPaymentWeight: Number,
    goldPaymentPurity: String,
    goldConvertedAmount: Number,
    oldBalanceBefore: Number,
    oldBalanceAfter: Number,
    advanceBalanceBefore: Number,
    advanceBalanceAfter: Number,
    convertedGram: Number,
    
    // Outstanding & Settlement Tracking
    collectedAmount: {
      type: Number,
      default: 0,
    },
    outstandingAmount: {
      type: Number,
      default: 0,
    },
    outstandingGram: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['PAID', 'PARTIAL'],
      default: 'PAID',
    },

    // Reprint Tracking
    printedCount: {
      type: Number,
      default: 0,
    },
    lastPrintedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Transaction', TransactionSchema);
