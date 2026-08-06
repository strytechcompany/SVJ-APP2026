const mongoose = require('mongoose');

// A simplified, name-based stock pool — separate from the barcode/Item Number
// Stock collection (used by Line Stock, QR label printing, and category/purity
// Reports, which this never touches). Each record is one Item Name holding a
// running Total Weight that depletes as B2C Plus/Wastage and B2D bills issue
// against it, matched case-insensitively.
const StockMasterSchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: [true, 'Item Name is required'],
      trim: true,
    },
    // Lowercased mirror of itemName — the actual case-insensitive matching key.
    itemNameLower: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    totalWeight: {
      type: Number,
      required: [true, 'Total Weight is required'],
      min: [0, 'Total Weight cannot be negative'],
      default: 0,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

StockMasterSchema.pre('validate', function (next) {
  if (this.itemName) {
    this.itemNameLower = this.itemName.trim().toLowerCase();
  }
  next();
});

module.exports = mongoose.model('StockMaster', StockMasterSchema);
