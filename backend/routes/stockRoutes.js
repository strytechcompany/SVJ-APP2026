const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  createStock,
  getAllStock,
  getStockSummary,
  getStockById,
  getStockByBarcode,
  updateStock,
  deleteStock,
  deleteStockGroup,
} = require('../controllers/stockController');

router.post('/create', protect, createStock);
router.get('/all', protect, getAllStock);
router.get('/summary', protect, getStockSummary);
router.get('/barcode/:barcode', protect, getStockByBarcode);
router.get('/:id', protect, getStockById);
router.put('/update/:id', protect, updateStock);
router.delete('/delete-group/:designName', protect, authorize('Admin', 'SuperAdmin'), deleteStockGroup);
router.delete('/delete/:id', protect, deleteStock);

module.exports = router;
