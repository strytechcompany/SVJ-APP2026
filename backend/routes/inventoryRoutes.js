const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getReceivedInventory, getReceivedSummary } = require('../controllers/inventoryController');

router.get('/received', protect, getReceivedInventory);
router.get('/received/summary', protect, getReceivedSummary);

module.exports = router;
