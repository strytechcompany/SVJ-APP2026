const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createTransaction,
  getTransactionById,
  getTransactionsByCustomer,
  getAllTransactions,
  getRecentTransactions,
  markPrinted,
  updateTransaction,
  deleteTransaction,
} = require('../controllers/transactionController');

router.post('/create', protect, createTransaction);
router.get('/all', protect, getAllTransactions);
router.get('/recent', protect, getRecentTransactions);
router.get('/customer/:customerId', protect, getTransactionsByCustomer);
router.post('/:id/print', protect, markPrinted);
router.put('/:id', protect, updateTransaction);
router.delete('/:id', protect, deleteTransaction);
router.get('/:id', protect, getTransactionById);

module.exports = router;
