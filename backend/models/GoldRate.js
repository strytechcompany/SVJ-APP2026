const mongoose = require('mongoose');

const goldRateSchema = new mongoose.Schema({
  rate: {
    type: Number,
    required: true,
    default: 0,
  },
  effectiveDate: {
    type: String,
    default: '',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: String,
    default: 'System',
  },
});

module.exports = mongoose.model('GoldRate', goldRateSchema);
