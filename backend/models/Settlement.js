const mongoose = require('mongoose');

const SettlementSchema = new mongoose.Schema(
  {
    originalTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
    },
    originalBillNumber: {
      type: String,
      required: true,
    },
    settlementBillNumber: {
      type: String,
      required: true,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    paymentMode: {
      type: String,
      enum: ['Cash', 'Online Payment', 'Card', 'Debt', 'Gold'],
      required: true,
    },
    amountPaid: {
      type: Number,
      required: true,
    },
    goldRateAtSettlement: {
      type: Number,
      required: true,
    },
    gramSettled: {
      type: Number,
      default: 0,
    },
    outstandingBefore: {
      type: Number,
      required: true,
    },
    outstandingAfter: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Settlement', SettlementSchema);
