const mongoose = require('mongoose');

const StockSchema = new mongoose.Schema(
  {
    itemNumber: {
      type: String,
      trim: true,
      required: [true, 'Item Number is required'],
    },
    barcode: {
      type: String,
      trim: true,
    },
    designName: {
      type: String,
      required: [true, 'Design name is required'],
      trim: true,
    },
    itemName: {
      type: String,
      trim: true,
      default: '',
    },
    supplierName: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: ['Necklace', 'Bangle', 'Ring', 'Earring', 'Chain', 'Bracelet', 'Pendant', 'Coin'],
    },
    purity: {
      type: String,
      required: [true, 'Purity is required'],
      enum: ['18K (750)', '22K (916)', '24K (999)'],
    },
    grossWeight: {
      type: Number,
      required: [true, 'Gross weight is required'],
      min: 0,
    },
    netWeight: {
      type: Number,
      required: [true, 'Net weight is required'],
      min: 0,
    },
    buyingTouch: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: 0,
      default: 1,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate barcode before saving if not provided
StockSchema.pre('save', async function (next) {
  if (!this.barcode) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    this.barcode = `SVJ${timestamp}${random}`;
  }
  next();
});

// Uniqueness is scoped to Active Stock only (isAvailable: true) — once an item
// is fully sold (quantity reaches 0, isAvailable becomes false) it no longer
// holds its Item Number/Barcode hostage, so the same Item Number can be
// re-uploaded as a brand new stock record without a false "already exists".
StockSchema.index({ itemNumber: 1 }, { unique: true, partialFilterExpression: { isAvailable: true } });
StockSchema.index({ barcode: 1 }, { unique: true, partialFilterExpression: { isAvailable: true } });

module.exports = mongoose.model('Stock', StockSchema);
