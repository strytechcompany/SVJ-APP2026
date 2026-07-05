const express = require('express');
const router = express.Router();
const { getGoldRate, updateGoldRate, getRecentIssued } = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');

router.get('/gold-rate', protect, getGoldRate);
router.put('/gold-rate', protect, updateGoldRate);
router.get('/recent-issued', protect, getRecentIssued);

module.exports = router;
