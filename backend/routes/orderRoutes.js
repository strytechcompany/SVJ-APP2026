const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  updateBillStyle,
  deleteOrder,
} = require('../controllers/orderController');

router.post('/create', protect, createOrder);
router.get('/all', protect, getAllOrders);
router.get('/:id', protect, getOrderById);
router.put('/:id/status', protect, updateOrderStatus);
router.put('/:id/bill-style', protect, updateBillStyle);
router.delete('/:id', protect, deleteOrder);

module.exports = router;
