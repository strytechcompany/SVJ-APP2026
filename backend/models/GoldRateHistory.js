const mongoose = require('mongoose');

const GoldRateHistorySchema = new mongoose.Schema({
  ratePerGram: { type: Number, required: true },
  updatedBy: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('GoldRateHistory', GoldRateHistorySchema);
