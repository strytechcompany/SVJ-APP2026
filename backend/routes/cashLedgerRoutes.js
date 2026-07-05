const express = require('express');
const router = express.Router();
const cashLedgerController = require('../controllers/cashLedgerController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, cashLedgerController.getLedgerHistory);
router.post('/adjust', protect, cashLedgerController.addManualAdjustment);

module.exports = router;
