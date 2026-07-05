const mongoose = require('mongoose');
const Counter = require('./Counter');

const CustomerSchema = new mongoose.Schema(
  {
    customerType: {
      type: String,
      required: [true, 'Customer type is required'],
      enum: ['B2C', 'B2B', 'B2D', 'LINE_STOCKER'],
    },
    customerCode: {
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
    shopName: {
      type: String,
      trim: true,
      default: '',
    },
    dealerCompanyName: {
      type: String,
      trim: true,
      default: '',
    },
    dealerCode: {
      type: String,
      trim: true,
      default: '',
    },
    gstNumber: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    oldBalance: {
      type: Number,
      default: 0,
      min: [0, 'Old balance cannot be negative'],
    },
    advance: {
      type: Number,
      default: 0,
      min: [0, 'Advance cannot be negative'],
    },
    lastTransactionDate: {
      type: Date,
      default: null,
    },
    transactionCount: {
      type: Number,
      default: 0,
    },
    totalPurchaseAmount: {
      type: Number,
      default: 0,
    },
    totalReceiptAmount: {
      type: Number,
      default: 0,
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const CUSTOMER_CODE_PREFIXES = {
  B2C: 'B2C',
  B2B: 'B2B',
  B2D: 'B2D',
  LINE_STOCKER: 'LS',
};

const getCounterId = (customerType) => `customerCode:${customerType}`;

const getMaxExistingSeq = async (customerType, prefix) => {
  const last = await mongoose
    .model('Customer')
    .findOne(
      { customerType, customerCode: { $regex: `^${prefix}\\d{5}$` } },
      { customerCode: 1 }
    )
    .sort({ customerCode: -1 })
    .lean();

  if (!last?.customerCode) return 0;
  const numPart = parseInt(last.customerCode.slice(prefix.length), 10);
  return Number.isFinite(numPart) ? numPart : 0;
};

CustomerSchema.statics.initializeCounters = async function () {
  const types = Object.keys(CUSTOMER_CODE_PREFIXES);
  await Promise.all(types.map(async (customerType) => {
    const prefix = CUSTOMER_CODE_PREFIXES[customerType];
    const counterId = getCounterId(customerType);
    const maxSeq = await getMaxExistingSeq(customerType, prefix);
    const existing = await Counter.findById(counterId).lean();

    if (!existing) {
      await Counter.create({ _id: counterId, seq: maxSeq });
      return;
    }

    if ((existing.seq || 0) < maxSeq) {
      await Counter.updateOne({ _id: counterId }, { $set: { seq: maxSeq } });
    }
  }));
};

CustomerSchema.statics.generateCustomerCode = async function (customerType) {
  const prefix = CUSTOMER_CODE_PREFIXES[customerType];
  if (!prefix) {
    throw new Error(`Unsupported customer type: ${customerType}`);
  }

  const counterId = getCounterId(customerType);
  const maxAttempts = 25;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const counter = await Counter.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const seq = counter?.seq || 1;
    const candidate = `${prefix}${String(seq).padStart(5, '0')}`;
    const exists = await this.exists({ customerCode: candidate });

    if (!exists) {
      return candidate;
    }
  }

  throw new Error(`Unable to generate unique customer code for ${customerType}`);
};

// Auto-generate customerCode per type: B2C00001, B2B00001, B2D00001
CustomerSchema.pre('save', async function (next) {
  // Enforce Balance Rule: A customer cannot have both Old Balance and Advance at the same time.
  const currentAdvance = this.advance || 0;
  const currentOldBalance = this.oldBalance || 0;
  
  const net = currentAdvance - currentOldBalance;
  if (net > 0) {
    this.advance = net;
    this.oldBalance = 0;
  } else if (net < 0) {
    this.oldBalance = Math.abs(net);
    this.advance = 0;
  } else {
    this.advance = 0;
    this.oldBalance = 0;
  }

  try {
    if (!this.customerCode) {
      this.customerCode = await this.constructor.generateCustomerCode(this.customerType);
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

// Indexes for fast search
CustomerSchema.index({ customerName: 'text', phoneNumber: 'text', customerCode: 'text', shopName: 'text', dealerCompanyName: 'text' });
CustomerSchema.index({ customerType: 1, isActive: 1 });

module.exports = mongoose.model('Customer', CustomerSchema);
