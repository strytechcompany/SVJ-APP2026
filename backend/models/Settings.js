const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  appName: {
    type: String,
    required: true,
    default: 'Sri Vaishnavi Jewellers',
  },
  maxUsers: {
    type: Number,
    required: true,
    default: 6,
  },
});

module.exports = mongoose.model('Settings', settingsSchema);
