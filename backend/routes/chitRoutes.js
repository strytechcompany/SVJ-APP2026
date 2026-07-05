const express = require('express');
const router = express.Router();
const chitController = require('../controllers/chitController');

// Routes for /api/chits

router.post('/', chitController.createChitCustomer);
router.get('/', chitController.getChitCustomers);

// Specific paths must go before parameterized paths
router.get('/all/transactions', chitController.getAllChitTransactions);

router.post('/:chitId/pay', chitController.payInstallment);
router.get('/:chitId/transactions', chitController.getChitTransactions);
router.post('/receipts/:receiptId/print', chitController.markReceiptPrinted);

module.exports = router;
