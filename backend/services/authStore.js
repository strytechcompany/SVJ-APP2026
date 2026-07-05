const User = require('../models/User');

// No-op kept for backward-compat with server.js import
const loadUsers = () => {
  console.log('[Auth] MongoDB-based authentication active');
};

const getUserByEmail = async (email) => {
  return await User.findOne({ email: email.toLowerCase().trim(), isActive: true });
};

const getUserById = async (id) => {
  try {
    return await User.findOne({ _id: id, isActive: true });
  } catch {
    return null;
  }
};

// Memory store for login OTPs
const otpCache = new Map();

const setOtp = (email, otp) => {
  otpCache.set(email.toLowerCase(), {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
};

const verifyOtp = (email, enteredOtp) => {
  const record = otpCache.get(email.toLowerCase());
  if (!record) return { success: false, message: 'Invalid or expired OTP' };

  if (record.expiresAt < Date.now()) {
    otpCache.delete(email.toLowerCase());
    return { success: false, message: 'OTP expired' };
  }

  if (record.otp !== enteredOtp) {
    return { success: false, message: 'Invalid OTP' };
  }

  otpCache.delete(email.toLowerCase());
  return { success: true };
};

// In-memory rate limiting (resets on restart — sufficient for requirements)
const rateLimitMap = new Map();

const isRateLimited = (identifier) => {
  const record = rateLimitMap.get(identifier);
  if (!record) return false;
  if (record.attempts >= 3) {
    if (Date.now() - record.lastAttempt < 15 * 60 * 1000) return true;
    rateLimitMap.delete(identifier);
    return false;
  }
  return false;
};

const incrementRateLimit = (identifier) => {
  const record = rateLimitMap.get(identifier) || { attempts: 0, lastAttempt: Date.now() };
  record.attempts += 1;
  record.lastAttempt = Date.now();
  rateLimitMap.set(identifier, record);
};

const clearRateLimit = (identifier) => {
  rateLimitMap.delete(identifier);
};

module.exports = {
  loadUsers,
  getUserByEmail,
  getUserById,
  verifyOtp,
  setOtp,
  isRateLimited,
  incrementRateLimit,
  clearRateLimit,
};
