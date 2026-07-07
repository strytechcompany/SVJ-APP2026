const mongoose = require('mongoose');

const ReceivedInventorySchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
    },
    receiptType: {
      type: String,
      trim: true,
    },
    weight: {
      type: Number,
      required: true,
    },
    lessWeight: {
      type: Number,
      default: 0,
    },
    actualTouch: {
      type: Number,
      default: 0,
    },
    takenTouch: {
      type: Number,
      default: 0,
    },
    purity: {
      type: Number,
      default: 0,
    },
    amount: {
      type: Number,
      default: 0,
    },
    sriCost: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['AVAILABLE', 'SOLD', 'MELTED'],
      default: 'AVAILABLE',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ReceivedInventory', ReceivedInventorySchema);
