const mongoose = require('mongoose');

const IssuedProductSchema = new mongoose.Schema({
  stockId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stock',
  },
  billNo: String,
  itemNumber: String,
  itemName: String,
  category: String,
  weight: Number,
  purity: String,
  count: Number,
});

// WASTAGE-style bill view: a purely additive, self-contained cash-based bill
// construction built on top of the real (gram-only) Line Stock issue —
// never affects issuedProducts, totalGram, stock, or oldBalanceBefore/After.
const WastageBillItemSchema = new mongoose.Schema({
  itemName: String,
  weight: Number,
  wastage: Number,
  rate: Number,
  ww: Number,    // weight + wastage
  cash: Number,  // ww * rate
});

const WastageBillReceivedItemSchema = new mongoose.Schema({
  receiptType: String,
  weight: Number,
  rate: Number,
  cash: Number,  // weight * rate
});

const WastageBillSchema = new mongoose.Schema({
  billNo: String,
  issuedItems: [WastageBillItemSchema],
  receivedItems: [WastageBillReceivedItemSchema],
  paymentMode: String,
  collectedAmount: { type: Number, default: 0 },
  oldBalanceBefore: { type: Number, default: 0 },
  advanceBalanceBefore: { type: Number, default: 0 },
  oldBalanceAfter: { type: Number, default: 0 },
  advanceBalanceAfter: { type: Number, default: 0 },
  subtractionAmount: { type: Number, default: 0 },
  reminderDate: Date,
});

const LineStockTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    issuedBy: {
      type: String,
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    expectedReturnDate: {
      type: Date,
      required: true,
    },
    totalItems: {
      type: Number,
      default: 0,
    },
    totalGram: {
      type: Number,
      default: 0,
    },
    // Old/Advance Balance Before + After: a live PROJECTION right after Issue
    // (before a Bill Style is saved), then the REAL committed values once a
    // PLUS-style Save Bill applies them to the customer (see balanceApplied
    // below). Settlement (Sold/Return) never touches balance — it's a
    // stock/paperwork step only; Issue's Save Bill is the sole place the
    // customer's real balance changes.
    oldBalanceBefore: {
      type: Number,
      default: 0,
    },
    oldBalanceAfter: {
      type: Number,
      default: 0,
    },
    advanceBalanceBefore: {
      type: Number,
      default: 0,
    },
    advanceBalanceAfter: {
      type: Number,
      default: 0,
    },
    // True once a PLUS-style Save Bill has actually committed
    // oldBalanceAfter/advanceBalanceAfter to the real customer document —
    // guards against re-applying the same addition twice if Save Bill (or a
    // notes-only re-save) is clicked again.
    balanceApplied: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'OVERDUE', 'SETTLED'],
      default: 'ACTIVE',
    },
    // Print/bill-preview layout choice — purely presentational, does not affect
    // stock, balance, or any saved calculation.
    billStyle: {
      type: String,
      enum: ['PLUS', 'WASTAGE', null],
      default: null,
    },
    wastageBill: WastageBillSchema,
    issuedProducts: [IssuedProductSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Auto-generate transactionNumber: LST00001
LineStockTransactionSchema.pre('save', async function (next) {
  if (this.transactionNumber) return next();

  try {
    const last = await mongoose
      .model('LineStockTransaction')
      .findOne({ transactionNumber: { $regex: /^LST\d{5}$/ } }, { transactionNumber: 1 })
      .sort({ transactionNumber: -1 })
      .lean();

    let nextNum = 1;
    if (last && last.transactionNumber) {
      const numPart = parseInt(last.transactionNumber.slice(3), 10);
      if (!isNaN(numPart)) nextNum = numPart + 1;
    }

    this.transactionNumber = `LST${String(nextNum).padStart(5, '0')}`;
    return next();
  } catch (err) {
    return next(err);
  }
});

module.exports = mongoose.model('LineStockTransaction', LineStockTransactionSchema);
