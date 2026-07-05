const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true },
    itemWeight: { type: Number, required: true, min: 0 },
    deliveryDateByCustomer: { type: Date, required: true },
    deliveryDateByGiver: { type: Date, required: true },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    customerType: {
      type: String,
      enum: ['B2C', 'B2B', 'B2D', 'LINE_STOCKER'],
      required: true,
    },

    orderItems: { type: [OrderItemSchema], default: [] },

    // Payment
    paymentMode: { type: String, enum: ['Cash', 'Gold', 'None'], default: 'None' },
    paymentAmount: { type: Number, default: 0 },
    goldPayWeight: { type: Number, default: 0 },
    goldPayPurity: { type: String, default: '22K (916)' },
    goldRate: { type: Number, default: 0 },

    // Calculated advance added to customer
    advanceCashAmount: { type: Number, default: 0 },
    advanceGramFromCash: { type: Number, default: 0 },
    advanceGramFromGold: { type: Number, default: 0 },
    advanceTotalGram: { type: Number, default: 0 },

    // Balance snapshots before/after order
    oldBalanceBefore: { type: Number, default: 0 },
    oldBalanceAfter: { type: Number, default: 0 },
    advanceBalanceBefore: { type: Number, default: 0 },
    advanceBalanceAfter: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['Pending', 'Ready', 'Delivered', 'Cancelled'],
      default: 'Pending',
    },

    notes: { type: String, trim: true, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true }
);

// Auto-generate order number before first save
OrderSchema.pre('save', async function (next) {
  if (this.orderNumber) return next();
  try {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `ORD${String(count + 1).padStart(5, '0')}`;
  } catch (err) {
    this.orderNumber = `ORD${Date.now()}`;
  }
  next();
});

module.exports = mongoose.model('Order', OrderSchema);
