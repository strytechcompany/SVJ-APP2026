const mongoose = require('mongoose');

const ChitTransactionSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    chitId: {
      type: String,
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChitCustomer',
      required: true,
    },
    installmentNumber: {
      type: Number,
      required: true,
    },
    totalInstallments: {
      type: Number,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    goldRate: {
      type: Number,
      required: true,
    },
    purchasedWeight: {
      type: Number,
      required: true,
    },
    previousWeight: {
      type: Number,
      default: 0,
    },
    runningWeight: {
      type: Number,
      required: true,
    },
    paymentDate: {
      type: Date,
      required: true,
    },
    paymentMode: {
      type: String,
      default: 'Cash',
    },
    pdfUrl: {
      type: String,
    },
    printedCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Auto-generate receiptNumber: CHP001, CHP002 etc.
ChitTransactionSchema.pre('save', async function (next) {
  if (this.receiptNumber) return next();

  try {
    const last = await mongoose
      .model('ChitTransaction')
      .findOne({ receiptNumber: { $regex: `^CHP\\d{6}$` } }, { receiptNumber: 1 })
      .sort({ receiptNumber: -1 })
      .lean();

    let nextNum = 1;
    if (last && last.receiptNumber) {
      const numPart = parseInt(last.receiptNumber.slice(3), 10);
      if (!isNaN(numPart)) nextNum = numPart + 1;
    }

    this.receiptNumber = `CHP${String(nextNum).padStart(6, '0')}`;
    return next();
  } catch (err) {
    return next(err);
  }
});

module.exports = mongoose.model('ChitTransaction', ChitTransactionSchema);
