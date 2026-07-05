const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createSettlement,
  getSettlementsByBill,
  getSettlementById,
} = require('../controllers/settlementController');

router.post('/create', protect, createSettlement);
router.get('/bill/:billId', protect, getSettlementsByBill);
router.get('/:id', protect, getSettlementById);

module.exports = router;
