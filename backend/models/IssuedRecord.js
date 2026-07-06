const mongoose = require('mongoose');

const issuedRecordSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    issueDate: {
      type: String, // "DD-MM-YYYY" format
      required: true,
    },
    goldWeight: {
      type: Number,
      required: true,
    },
    issueType: {
      type: String,
      enum: ['B2C', 'B2D'],
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('IssuedRecord', issuedRecordSchema);
