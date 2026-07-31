const mongoose = require('mongoose');

// PLUS Bill structure — a self-contained, gram-based bill view built on top of
// the real settlement (soldItems/returnedItems). Purely additive: never
// touches soldItems, returnedItems, finalBalance, advanceBalance, or the real
// customer balance updated by createSettlement.
const PlusBillIssuedItemSchema = new mongoose.Schema({
  itemName: String,
  weight: Number,
  actualTouch: Number,
  purity: Number,
});
const PlusBillReceivedItemSchema = new mongoose.Schema({
  itemName: String,
  weight: Number,
  buyingTouch: Number,
  purity: Number,
});
const PlusBillSchema = new mongoose.Schema({
  issuedItems: [PlusBillIssuedItemSchema],
  receivedItems: [PlusBillReceivedItemSchema],
  oldBalanceBefore: { type: Number, default: 0 },
  advanceBalanceBefore: { type: Number, default: 0 },
  oldBalanceAfter: { type: Number, default: 0 },
  advanceBalanceAfter: { type: Number, default: 0 },
});

// WASTAGE Bill structure — a self-contained, cash-based bill view (Weight ×
// manually-entered Rate = Cash). Same additive guarantee as PlusBillSchema.
const WastageBillItemSchema = new mongoose.Schema({
  itemName: String,
  weight: Number,
  wastage: Number,
  rate: Number,
  cash: Number,
});
const SettlementWastageBillSchema = new mongoose.Schema({
  issuedItems: [WastageBillItemSchema],
  receivedItems: [WastageBillItemSchema],
  // Legacy gram-based fields — retained for backward compatibility with bills
  // saved before the Balance Rate cash-conversion feature below; no longer
  // written to for new saves.
  oldBalanceBefore: { type: Number, default: 0 },
  advanceBalanceBefore: { type: Number, default: 0 },
  oldBalanceAfter: { type: Number, default: 0 },
  advanceBalanceAfter: { type: Number, default: 0 },
  // Cash-conversion fields (Wastage Bill only) — the ONE calculation for this
  // bill's balance section. The real settlement balance stays gram-based
  // (previousBalance/advanceBalanceBefore/finalBalance/advanceBalance on the
  // parent LineStockSettlement) and is untouched by any of this; these fields
  // are purely a derived cash VIEW for the Wastage Bill's own preview/print.
  balanceRate: { type: Number, default: 0 },
  previousBalanceGram: { type: Number, default: 0 },
  previousBalanceCash: { type: Number, default: 0 },
  currentOldBalanceCash: { type: Number, default: 0 },
  currentAdvanceBalanceCash: { type: Number, default: 0 },
});

const LineStockSettlementSchema = new mongoose.Schema(
  {
    settlementNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    lineStockTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LineStockTransaction',
      required: true,
    },
    settledBy: {
      type: String,
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    soldItems: [
      {
        stockId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock' },
        itemNumber: String,
        barcode: String,
        itemName: String,
        weight: Number,
        purity: String,
        count: Number,
        amount: Number,
      }
    ],
    returnedItems: [
      {
        stockId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock' },
        itemNumber: String,
        barcode: String,
        itemName: String,
        category: String,
        weight: Number,
        purity: String,
        count: Number,
      }
    ],
    paymentDetails: {
      cash: { type: Number, default: 0 },
      online: { type: Number, default: 0 },
      card: { type: Number, default: 0 },
      gold: { type: Number, default: 0 },
      receivedGram: { type: Number, default: 0 },
    },
    // previousBalance/advanceBalanceBefore + finalBalance/advanceBalance are the
    // ONE canonical balance calculation for this settlement (computed exactly
    // once in createSettlement). Every screen — Settlement Summary, Bill
    // Preview, Recent Transactions, Customer List, Reports — must read these
    // saved values rather than recomputing them.
    previousBalance: { type: Number, default: 0 },
    advanceBalanceBefore: { type: Number, default: 0 },
    finalBalance: { type: Number, default: 0 },
    advanceBalance: { type: Number, default: 0 },
    remarks: { type: String, default: '' },
    status: {
      type: String,
      enum: ['SETTLED', 'ACTIVE'],
      default: 'SETTLED',
    },
    // A draft holds Sold Products saved incrementally, before the settlement is
    // finalized (payments entered, stock/balance/ledger effects applied). Only
    // one draft may exist per lineStockTransactionId at a time.
    isDraft: {
      type: Boolean,
      default: false,
    },
    // Print/bill-preview layout choice — purely presentational, does not affect
    // stock, balance, or any saved calculation.
    billStyle: {
      type: String,
      enum: ['PLUS', 'WASTAGE', null],
      default: null,
    },
    plusBill: PlusBillSchema,
    wastageBill: SettlementWastageBillSchema,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Auto-generate settlementNumber: LSS00001
LineStockSettlementSchema.pre('save', async function (next) {
  if (this.settlementNumber) return next();

  try {
    const last = await mongoose
      .model('LineStockSettlement')
      .findOne({ settlementNumber: { $regex: /^LSS\d{5}$/ } }, { settlementNumber: 1 })
      .sort({ settlementNumber: -1 })
      .lean();

    let nextNum = 1;
    if (last && last.settlementNumber) {
      const numPart = parseInt(last.settlementNumber.slice(3), 10);
      if (!isNaN(numPart)) nextNum = numPart + 1;
    }

    this.settlementNumber = `LSS${String(nextNum).padStart(5, '0')}`;
    return next();
  } catch (err) {
    return next(err);
  }
});

module.exports = mongoose.model('LineStockSettlement', LineStockSettlementSchema);
