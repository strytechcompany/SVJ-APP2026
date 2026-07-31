const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const controller = require('../controllers/balanceSettlementController');

router.use(protect);

router.get('/old-balance/customers', controller.getOldBalanceCustomers);
router.get('/advance-balance/customers', controller.getAdvanceBalanceCustomers);
router.post('/settle', controller.createSettlement);
router.get('/history/:type', controller.getSettlementsByType);
router.get('/customer/:customerId', controller.getSettlementsByCustomer);
router.put('/:id', controller.updateSettlement);
router.delete('/:id', controller.deleteSettlement);
router.get('/:id', controller.getSettlementById);

module.exports = router;
