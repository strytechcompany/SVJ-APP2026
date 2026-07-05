const express = require('express');
const router = express.Router();
const {
  login,
  verifyOtp,
  getProfile,
  requestPasswordChangeOtp,
  changePassword,
  forgotPassword,
  resetForgotPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.get('/profile', protect, getProfile);
router.post('/request-password-otp', protect, requestPasswordChangeOtp);
router.post('/change-password', protect, changePassword);

// Public forgot-password flow (no auth required)
router.post('/forgot-password', forgotPassword);
router.post('/reset-forgot-password', resetForgotPassword);

module.exports = router;
