const mongoose = require('mongoose');

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
    previousBalance: { type: Number, default: 0 },
    finalBalance: { type: Number, default: 0 },
    advanceBalance: { type: Number, default: 0 },
    remarks: { type: String, default: '' },
    status: {
      type: String,
      enum: ['SETTLED', 'ACTIVE'],
      default: 'SETTLED',
    },
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
