const mongoose = require('mongoose');

const LoginAuditSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  ipAddress: {
    type: String,
  },
  device: {
    type: String,
  },
  status: {
    type: String,
    enum: ['Success', 'Failed - Invalid Password', 'Failed - Invalid OTP', 'Failed - Unauthorized Email'],
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('LoginAudit', LoginAuditSchema);
