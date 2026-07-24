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
  // Wastage-account fields (customerCategory === 'WASTAGE')
  // Cash model: value1 = WW (Weight + Wastage), rate = ₹ per gram, amount = Cash (WW × rate)
  wastage: Number,
  value1: Number,
  rate: Number,
  actualTouch: Number,
  takenTouch: Number,
  value2: Number,
  profit: Number,
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
  // B2D receipt field: purity = weight * (sriCost / 100)
  sriCost: Number,
  // Wastage-account field: rate = ₹ per gram, amount = Cash (weight × rate)
  rate: Number,
});

const PaymentDetailsSchema = new mongoose.Schema({
  mode: {
    type: String,
  },
  subMode: String, // GPay, Debit Card, etc.
  amount: Number,
});

const WastageProfitSchema = new mongoose.Schema({
  buyingWeight: Number,
  buyingPercent: Number,
  sellingWeight: Number,
  sellingPercent: Number,
  bValue: Number,
  sValue: Number,
  profit: Number,
});

const PlusProfitSchema = new mongoose.Schema({
  weight: Number,
  buyingPercent: Number,
  sellingPercent: Number,
  bValue: Number,
  sValue: Number,
  profit: Number,
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
      enum: ['B2C', 'B2D', 'LINE_STOCK_SETTLEMENT'],
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
    commonBillNo: String,
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

    // Wastage-account bill (customerCategory === 'WASTAGE'): cash-based Issue/Receipt
    isWastage: {
      type: Boolean,
      default: false,
    },

    // Wastage Profit Table — internal-only, never rendered on the bill/print
    wastageProfit: [WastageProfitSchema],

    // Plus Profit Table (customerCategory !== 'WASTAGE') — internal-only, never rendered on the bill/print
    plusProfit: [PlusProfitSchema],

    // Plus Cash Table (customerCategory !== 'WASTAGE'): one or more Cash (₹) -> Pure
    // gram conversions (each at its own manually-entered rate), folded into the
    // Outstanding calculation alongside the Issue/Receipt Pure difference.
    // plusCashAmount/plusCashRate/plusFinalGram are kept for backward compatibility
    // (older single-row bills) — plusFinalGram now also doubles as the row-sum total.
    plusCashAmount: Number,
    plusCashRate: Number,
    plusFinalGram: Number,
    plusCashRows: [{ cash: Number, rate: Number, finalGram: Number }],

    // Plus Gram Table (Gram/Cash toggle set to Gram mode): one or more manually
    // entered Pure gram amounts, summed into plusTotalGram.
    plusGramRows: [{ gram: Number }],
    plusTotalGram: Number,

    // Plus Final Summary's Outstanding (Issue/Receipt Pure + Old/Advance Balance +
    // Cash/Gram conversions combined) before the optional Remainder Table adjustment.
    plusOutstanding: Number,
    // Remainder Table (both Wastage and Plus): an optional final manual adjustment
    // subtracted from the already-computed balance, with automatic Old Balance <->
    // Advance Balance conversion on a sign flip. Zero/unset means no effect.
    wastageSubtractionAmount: Number,
    plusReminderPure: Number,
    // Shared reminder — settable from either module's Remainder Table.
    reminderDate: Date,

    // For storing gold rate at the time of transaction
    goldRate: Number,

    // Advanced Payment Tracking
    description: String,
    paymentMode: String,
    // Wastage bill payment settlement — how the Final Cash was handled at save time
    // (distinct from paymentMode, which is the payment method used):
    // 'COLLECT_CASH' -> fully paid now, customer balance resets to 0.
    // 'ADD_TO_BALANCE' -> unpaid, Final Cash added to the customer's running cash balance.
    paymentOption: String,
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

// Generates the next number in an independent, atomic running sequence for a
// B2C sub-type: B2CW1, B2CW2... for Wastage, B2CP1, B2CP2... for Plus. Uses
// the shared Counter collection (findByIdAndUpdate + $inc + upsert) so two
// concurrent bill saves can never receive the same number.
TransactionSchema.statics.generateB2CBillNumber = async function (category) {
  const Counter = require('./Counter');
  const prefix = category === 'WASTAGE' ? 'B2CW' : 'B2CP';
  const counter = await Counter.findByIdAndUpdate(
    `billNo:${prefix}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}${counter.seq}`;
};

module.exports = mongoose.model('Transaction', TransactionSchema);
