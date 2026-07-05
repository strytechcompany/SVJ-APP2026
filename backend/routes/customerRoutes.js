const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  searchCustomers,
  getByType,
} = require('../controllers/customerController');

router.post('/create', protect, createCustomer);
router.get('/all', protect, getAllCustomers);
router.get('/search', protect, searchCustomers);
router.get('/type/:type', protect, getByType);
router.get('/:id', protect, getCustomerById);
router.put('/update/:id', protect, updateCustomer);
router.delete('/delete/:id', protect, deleteCustomer);

module.exports = router;
