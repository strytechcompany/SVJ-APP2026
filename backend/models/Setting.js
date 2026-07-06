const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
  shopProfile: {
    shopName: { type: String, default: 'Sri Vaishnavi Jewellers' },
    ownerName: { type: String, default: '' },
    address: { type: String, default: 'No 370, Big Bazaar Street\n(Opp - B.G. Naidu Sweets)\nTrichy - 620003' },
    phone1: { type: String, default: '8248134521' },
    phone2: { type: String, default: '9042987827' },
    gstNo: { type: String, default: '' },
    email: { type: String, default: '' },
    logo: { type: String, default: '' }
  },
  goldRate: {
    ratePerGram: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: String }
  },
  sriBill: {
    defaultPercent: { type: Number, default: 87 }
  },
  loginSettings: {
    emailLogin: { type: Boolean, default: true },
    passwordLogin: { type: Boolean, default: true },
    otpLogin: { type: Boolean, default: false },
    sessionTimeoutMins: { type: Number, default: 60 },
    rememberLogin: { type: Boolean, default: true }
  },
  billSettings: {
    tamilMessage: { type: String, default: 'நீங்கள் வாங்கும் ஒவ்வொரு கிராம் தங்கமும், உங்கள் எதிர்காலத்தின் ஒளிமயமான சேமிப்பு.' },
    footerMessage: { type: String, default: 'Thank you for your business!' },
    printCopies: { type: Number, default: 1 },
    hsnCode: { type: String, default: '7113' },
    prefixes: {
      b2c: { type: String, default: 'SVJ-B2C-' },
      lineStock: { type: String, default: 'SVJ-LS-' },
      chit: { type: String, default: 'SVJ-CHIT-' }
    }
  },
  whatsappSettings: {
    businessNumber: { type: String, default: '' },
    enableShare: { type: Boolean, default: true }
  },
  printerSettings: {
    barcodePrinter: { type: String, default: '' },
    thermalPrinter: { type: String, default: '' },
    a4Printer: { type: String, default: '' }
  },
  barcodeSettings: {
    prefix: { type: String, default: 'SVJ' },
    autoGenerate: { type: Boolean, default: true },
    startingSequence: { type: Number, default: 1000 }
  },
  cashLedgerSettings: {
    openingBalance: { type: Number, default: 0 }
  },
  notificationSettings: {
    overdueLineStock: { type: Boolean, default: true },
    chitDue: { type: Boolean, default: true },
    lowStock: { type: Boolean, default: true },
    dailyReport: { type: Boolean, default: true },
    monthlyReport: { type: Boolean, default: true }
  },
  reportSettings: {
    defaultProfitGoldRate: { type: Number, default: 0 },
    watermark: { type: String, default: 'Sri Vaishnavi Jewellers' },
    enablePdfFooter: { type: Boolean, default: true },
    enableCompanyLogo: { type: Boolean, default: true }
  }
}, { timestamps: true });

module.exports = mongoose.model('Setting', SettingSchema);
