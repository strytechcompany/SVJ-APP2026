const mongoose = require('mongoose');

const StockMovementSchema = new mongoose.Schema(
  {
    stockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Stock',
      required: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    movementType: {
      type: String,
      enum: ['ISSUE', 'RETURN', 'MANUAL_ADJUSTMENT'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    weight: {
      type: Number,
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    customerType: {
      type: String,
      enum: ['B2C', 'B2D'],
    },
    transactionType: {
      type: String,
    },
    stockSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('StockMovement', StockMovementSchema);
