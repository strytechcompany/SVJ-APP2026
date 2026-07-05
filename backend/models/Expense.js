const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema(
  {
    expenseName: {
      type: String,
      required: true,
      trim: true,
    },
    expenseDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expenseType: {
      type: String,
      required: true,
      enum: ['Daily', 'Monthly'],
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', ExpenseSchema);
