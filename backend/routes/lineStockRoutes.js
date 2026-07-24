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
router.post('/settlement/sold-item', settlementController.saveSoldItem);
router.get('/settlement/draft/:lineStockTransactionId', settlementController.getDraftSettlement);
router.delete('/settlement/draft/:lineStockTransactionId/sold-item/:stockId', settlementController.deleteSoldItem);
router.put('/settlement/:id/bill-style', settlementController.updateBillStyle);
router.put('/settlement/:id/plus-bill', settlementController.savePlusBill);
router.put('/settlement/:id/wastage-bill', settlementController.saveWastageBill);
router.get('/settlement/:id', settlementController.getSettlementById);
router.delete('/clear-all', lineStockController.clearAllTransactions);
router.put('/:id/bill-style', lineStockController.updateBillStyle);
router.put('/:id/wastage-bill', lineStockController.saveWastageBill);
router.get('/:id', lineStockController.getTransactionById);
router.put('/:id', lineStockController.updateTransaction);
router.delete('/:id', lineStockController.deleteTransaction);

module.exports = router;
