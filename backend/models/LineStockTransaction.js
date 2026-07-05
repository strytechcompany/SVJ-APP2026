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
    oldBalanceBefore: {
      type: Number,
      default: 0,
    },
    oldBalanceAfter: {
      type: Number,
      default: 0,
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
