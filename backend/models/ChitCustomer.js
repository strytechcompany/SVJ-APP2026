const mongoose = require('mongoose');

const ChitCustomerSchema = new mongoose.Schema(
  {
    chitId: {
      type: String,
      unique: true,
      trim: true,
    },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    durationMonths: {
      type: Number,
      required: [true, 'Duration in months is required'],
    },
    monthlyAmount: {
      type: Number,
      required: [true, 'Monthly amount is required'],
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    completedMonths: {
      type: Number,
      default: 0,
    },
    totalWeightAccumulated: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

// Auto-generate chitId: GRP001, GRP002 etc.
ChitCustomerSchema.pre('save', async function (next) {
  if (this.chitId) return next(); 

  try {
    const last = await mongoose
      .model('ChitCustomer')
      .findOne({ chitId: { $regex: `^GRP\\d{3}$` } }, { chitId: 1 })
      .sort({ chitId: -1 })
      .lean();

    let nextNum = 1;
    if (last && last.chitId) {
      const numPart = parseInt(last.chitId.slice(3), 10);
      if (!isNaN(numPart)) nextNum = numPart + 1;
    }

    this.chitId = `GRP${String(nextNum).padStart(3, '0')}`;
    return next();
  } catch (err) {
    return next(err);
  }
});

// Indexes for fast search
ChitCustomerSchema.index({ customerName: 'text', phoneNumber: 'text', chitId: 'text' });
ChitCustomerSchema.index({ status: 1 });

module.exports = mongoose.model('ChitCustomer', ChitCustomerSchema);
