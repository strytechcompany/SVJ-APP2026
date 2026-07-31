const mongoose = require('mongoose');

// A single "Add Item" row — tagged with which mode it was entered in so the
// bill can show Cash Amount/Gold Rate for cash rows and a plain Gram value
// for gram rows, even if the admin switched modes mid-settlement.
const SettlementItemSchema = new mongoose.Schema({
  mode: { type: String, enum: ['CASH', 'GRAM'], required: true },
  cashAmount: { type: Number, default: 0 },
  goldRate: { type: Number, default: 0 },
  gram: { type: Number, default: 0 }, // for CASH rows: cashAmount / goldRate; for GRAM rows: the entered value directly
});

const BalanceSettlementSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    // OLD: settles against Old Balance. ADVANCE: settles against Advance Balance.
    type: {
      type: String,
      enum: ['OLD', 'ADVANCE'],
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    settlementMode: {
      type: String,
      enum: ['CASH', 'GRAM'],
      required: true,
    },
    items: [SettlementItemSchema],
    totalSettlementGram: { type: Number, default: 0 },
    previousOldBalance: { type: Number, default: 0 },
    previousAdvanceBalance: { type: Number, default: 0 },
    finalOldBalance: { type: Number, default: 0 },
    finalAdvanceBalance: { type: Number, default: 0 },
    remarks: { type: String, default: '' },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Atomic running sequence: OBS1, OBS2... for Old Balance settlements,
// ABS1, ABS2... for Advance Balance settlements. Mirrors Transaction.js's
// generateB2CBillNumber (shared Counter collection, upsert + $inc).
BalanceSettlementSchema.statics.generateBillNumber = async function (type) {
  const Counter = require('./Counter');
  const prefix = type === 'ADVANCE' ? 'ABS' : 'OBS';
  const counter = await Counter.findByIdAndUpdate(
    `billNo:${prefix}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}${counter.seq}`;
};

module.exports = mongoose.model('BalanceSettlement', BalanceSettlementSchema);
