const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const lineStockController = require('../controllers/lineStockController');
const settlementController = require('../controllers/lineStockSettlementController');

router.use(protect);

router.get('/dashboard/summary', lineStockController.getDashboardSummary);
router.get('/', lineStockController.getTransactions);
router.post('/issue', lineStockController.issueStock);
router.post('/settle', settlementController.createSettlement);
router.get('/settlement/:id', settlementController.getSettlementById);
router.get('/:id', lineStockController.getTransactionById);

module.exports = router;
