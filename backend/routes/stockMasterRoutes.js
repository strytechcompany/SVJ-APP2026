const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createStockMaster,
  getAllStockMaster,
  getStockMasterById,
  updateStockMaster,
  deleteStockMaster,
} = require('../controllers/stockMasterController');

router.post('/create', protect, createStockMaster);
router.get('/all', protect, getAllStockMaster);
router.get('/:id', protect, getStockMasterById);
router.put('/update/:id', protect, updateStockMaster);
router.delete('/delete/:id', protect, deleteStockMaster);

module.exports = router;
