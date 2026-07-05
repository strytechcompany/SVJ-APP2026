const crypto = require('crypto');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OtpToken = require('../models/OtpToken');

const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_REQUESTS_PER_HOUR = 5;

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

const createTransporter = () =>
  nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this email' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is deactivated' });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRequests = await OtpToken.countDocuments({
      email: email.toLowerCase(),
      createdAt: { $gte: oneHourAgo },
    });

    if (recentRequests >= MAX_OTP_REQUESTS_PER_HOUR) {
      return res.status(429).json({
        success: false,
        message: `Too many OTP requests. Please try again after 1 hour.`,
      });
    }

    await OtpToken.deleteMany({ email: email.toLowerCase() });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await OtpToken.create({ email: email.toLowerCase(), otp, expiresAt });

    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Sri Vaishnavi Jewellers" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Your OTP - Sri Vaishnavi Jewellers',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #E8E0CC;border-radius:12px;">
          <h2 style="color:#1A1A1A;margin-bottom:4px;">Sri Vaishnavi Jewellers</h2>
          <p style="color:#888;font-size:13px;margin-bottom:24px;">One-Time Password</p>
          <p style="color:#1A1A1A;">Hello <strong>${user.name}</strong>,</p>
          <p style="color:#555;">Use the OTP below to sign in. It expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.</p>
          <div style="text-align:center;margin:28px 0;">
            <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#D4AF37;">${otp}</span>
          </div>
          <p style="color:#888;font-size:12px;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true, message: `OTP sent to ${user.email}` });
  } catch (error) {
    console.error('Send OTP Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const record = await OtpToken.findOne({ email: email.toLowerCase() });

    if (!record) {
      return res.status(400).json({ success: false, message: 'OTP not found or already used' });
    }

    if (record.attempts >= 5) {
      await OtpToken.deleteOne({ _id: record._id });
      return res.status(429).json({ success: false, message: 'Too many failed attempts. Request a new OTP.' });
    }

    if (new Date() > record.expiresAt) {
      await OtpToken.deleteOne({ _id: record._id });
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (record.otp !== otp.toString()) {
      await OtpToken.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      const remaining = 5 - (record.attempts + 1);
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${remaining} attempt(s) remaining.`,
      });
    }

    await OtpToken.deleteOne({ _id: record._id });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Account not found or inactive' });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Verify OTP Error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { sendOtp, verifyOtp };
