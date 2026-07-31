const mongoose = require('mongoose');

// PLUS Bill structure — a self-contained bill view built on top of the
// order's own orderItems. Purely additive: never touches orderItems,
// payment, or balance fields.
const PlusBillItemSchema = new mongoose.Schema({
  itemName: String,
  weight: Number,
  rate: Number,
  cash: Number,
}, { _id: false });
const PlusBillSchema = new mongoose.Schema({
  items: [PlusBillItemSchema],
}, { _id: false });

// WASTAGE Bill structure — Cash = Weight × Rate (Wastage % is stored/shown
// for reference only, it does not factor into the Cash calculation). Same
// additive guarantee as PlusBillSchema.
const WastageBillItemSchema = new mongoose.Schema({
  itemName: String,
  weight: Number,
  wastage: Number,
  rate: Number,
  cash: Number,
}, { _id: false });
const WastageBillSchema = new mongoose.Schema({
  items: [WastageBillItemSchema],
  // Cash-conversion fields (Wastage Bill only) — the ONE calculation for this
  // bill's balance section. The order's real gram-based balance
  // (oldBalanceBefore/After, advanceBalanceBefore/After at the top level)
  // stays untouched; these are purely a derived cash VIEW for the Wastage
  // Bill's own preview/print.
  balanceRate: { type: Number, default: 0 },
  previousBalanceGram: { type: Number, default: 0 },
  previousBalanceCash: { type: Number, default: 0 },
  currentOldBalanceCash: { type: Number, default: 0 },
  currentAdvanceBalanceCash: { type: Number, default: 0 },
}, { _id: false });

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
      enum: ['B2C', 'B2D', 'LINE_STOCKER'],
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

    // Print/bill-preview layout choice — purely presentational, does not affect
    // any saved calculation or balance.
    billStyle: {
      type: String,
      enum: ['PLUS', 'WASTAGE', null],
      default: null,
    },
    plusBill: PlusBillSchema,
    wastageBill: WastageBillSchema,

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
