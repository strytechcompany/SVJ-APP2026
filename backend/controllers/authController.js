const jwt = require('jsonwebtoken');
const axios = require('axios');
const authStore = require('../services/authStore');
const LoginAudit = require('../models/LoginAudit');
const User = require('../models/User');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });
};

// ─── Branded HTML email builder ────────────────────────────────────────────
const buildOtpEmailHtml = (name, otp, type = 'login') => {
  const isReset = type === 'forgot-password';
  const badgeLabel = isReset ? 'PASSWORD RESET' : 'LOGIN VERIFICATION';
  const actionText = isReset
    ? 'We received a request to reset the password for your account. Use the one-time code below to proceed with your password reset.'
    : 'A one-time verification code has been requested for your Sri Vaishnavi Jewellers account. Use the code below to complete your sign-in.';
  const footerNote = isReset
    ? 'If you did not request a password reset, please ignore this email — your current password will remain unchanged and no action is required.'
    : 'If you did not attempt to sign in, please ignore this email. Your account remains secure.';
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isReset ? 'Password Reset' : 'Login Verification'} — Sri Vaishnavi Jewellers</title>
</head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F5F0E8;padding:36px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
          style="max-width:560px;width:100%;background:#FFFFFF;border-radius:18px;overflow:hidden;
                 box-shadow:0 8px 40px rgba(75,46,5,0.14);">

          <!-- ── HEADER ── -->
          <tr>
            <td style="background:#4B2E05;padding:36px 40px 30px;text-align:center;">
              <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#D4AF37;
                         letter-spacing:4px;text-transform:uppercase;">&#x2728; Sri Vaishnavi</p>
              <p style="margin:0;font-size:28px;font-weight:900;color:#FFFFFF;
                         letter-spacing:5px;text-transform:uppercase;">JEWELLERS</p>
              <div style="width:64px;height:2px;background:#D4AF37;margin:16px auto 0;
                           border-radius:1px;"></div>
            </td>
          </tr>

          <!-- ── GOLD BADGE ── -->
          <tr>
            <td style="background:linear-gradient(90deg,#C9A227,#D4AF37,#C9A227);
                        padding:8px 40px;text-align:center;">
              <span style="font-size:10px;font-weight:800;color:#4B2E05;
                            letter-spacing:3px;text-transform:uppercase;">${badgeLabel}</span>
            </td>
          </tr>

          <!-- ── BODY ── -->
          <tr>
            <td style="padding:38px 40px 28px;">

              <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1A1A1A;">
                Hello, ${name} &#x1F44B;
              </p>
              <p style="margin:0 0 32px;font-size:14px;color:#666666;line-height:1.75;">
                ${actionText}
              </p>

              <!-- OTP CARD -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="margin-bottom:28px;">
                <tr>
                  <td style="background:#4B2E05;border-radius:14px;padding:30px 24px;
                              text-align:center;">
                    <p style="margin:0 0 12px;font-size:10px;font-weight:800;color:#D4AF37;
                               letter-spacing:4px;text-transform:uppercase;">
                      Your One-Time Password
                    </p>
                    <div style="background:rgba(255,255,255,0.07);border-radius:10px;
                                 padding:16px 24px;display:inline-block;">
                      <p style="margin:0;font-size:48px;font-weight:900;color:#FFFFFF;
                                 letter-spacing:18px;font-family:'Courier New',Courier,monospace;
                                 line-height:1;">
                        ${otp}
                      </p>
                    </div>
                    <p style="margin:16px 0 0;font-size:12px;color:rgba(255,255,255,0.55);">
                      &#x23F1;&nbsp; Expires in&nbsp;
                      <strong style="color:#D4AF37;">5 minutes</strong>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- SECURITY NOTICE -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:#FFFBF3;border-left:4px solid #D4AF37;
                              border-radius:0 10px 10px 0;padding:16px 18px;">
                    <p style="margin:0;font-size:12px;color:#7A4E1A;line-height:1.75;">
                      &#x1F512;&nbsp;<strong>Security Notice</strong> — Never share this
                      code with anyone. Sri Vaishnavi Jewellers staff will <em>never</em>
                      ask for your OTP. ${footerNote}
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── DIVIDER ── -->
          <tr>
            <td style="padding:0 40px;">
              <div style="border-top:1px solid #EEE3D5;"></div>
            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td style="padding:22px 40px 34px;text-align:center;">
              <p style="margin:0 0 5px;font-size:12px;color:#AAAAAA;">
                This is an automated message &mdash; please do not reply to this email.
              </p>
              <p style="margin:0;font-size:11px;color:#CCCCCC;">
                &copy; ${year}&nbsp; Sri Vaishnavi Jewellers &nbsp;&middot;&nbsp; All rights reserved
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ─── Email sender (used for both login OTP and forgot-password OTP) ─────────
const sendOTPEmail = async (email, otp, name = 'User', type = 'login') => {
  console.log(`[EMAIL] Attempting OTP send → ${email} (type=${type})`);
  try {
    const subject = type === 'forgot-password'
      ? 'Sri Vaishnavi Jewellers — Password Reset OTP'
      : 'Sri Vaishnavi Jewellers — Login Verification Code';

    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { name: 'Sri Vaishnavi Jewellers', email: process.env.EMAIL_USER },
        to: [{ email }],
        subject,
        htmlContent: buildOtpEmailHtml(name, otp, type),
        textContent: `Hello ${name},\n\nYour OTP is: ${otp}\n\nThis code expires in 5 minutes.\n\nSri Vaishnavi Jewellers`,
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log(`[EMAIL] ✓ Sent via Brevo API | to=${email} msgId=${response.data.messageId}`);
    return true;
  } catch (error) {
    const errMsg = error.response?.data?.message || error.message;
    console.error(`[EMAIL] ✗ Failed | to=${email} | ${errMsg}`);
    console.log(`[EMAIL] OTP fallback → email=${email} otp=${otp}`);
    return false;
  }
};

// ─── Controllers ─────────────────────────────────────────────────────────────

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const device = req.headers['user-agent'] || 'Unknown';

    console.log(`[AUTH] Login attempt | email=${email} ip=${ipAddress}`);

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const identifier = `${ipAddress}_${email.toLowerCase()}`;
    if (authStore.isRateLimited(identifier)) {
      console.log(`[AUTH] Rate limited | identifier=${identifier}`);
      return res.status(429).json({ success: false, message: 'Too many attempts. Locked out for 15 minutes.' });
    }

    const user = await authStore.getUserByEmail(email);

    if (!user) {
      console.log(`[AUTH] Unknown email | email=${email}`);
      try { await LoginAudit.create({ email, ipAddress, device, status: 'Failed - Unauthorized Email' }); } catch (_) {}
      authStore.incrementRateLimit(identifier);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.matchPassword(password);
    console.log(`[AUTH] Password check | email=${email} match=${isMatch}`);
    if (!isMatch) {
      try { await LoginAudit.create({ email, ipAddress, device, status: 'Failed - Invalid Password' }); } catch (_) {}
      authStore.incrementRateLimit(identifier);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    authStore.setOtp(email, otp);
    console.log(`[AUTH] OTP generated | email=${email}`);

    // Fire-and-forget: don't block the HTTP response waiting for SMTP
    sendOTPEmail(user.email, otp, user.name, 'login').catch(err =>
      console.error('[AUTH] OTP email catch:', err.message)
    );
    console.log(`[AUTH] OTP email triggered (fire-and-forget) for ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'OTP Sent. Requires OTP verification.',
      requires_otp: true,
      email: user.email,
    });
  } catch (error) {
    console.error('[AUTH] Login Error:', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const device = req.headers['user-agent'] || 'Unknown';

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const identifier = `${ipAddress}_${email.toLowerCase()}`;
    if (authStore.isRateLimited(identifier)) {
      return res.status(429).json({ success: false, message: 'Too many attempts. Locked out for 15 minutes.' });
    }

    const result = authStore.verifyOtp(email, otp);
    if (!result.success) {
      try { await LoginAudit.create({ email, ipAddress, device, status: 'Failed - Invalid OTP' }); } catch (_) {}
      authStore.incrementRateLimit(identifier);
      return res.status(401).json({ success: false, message: result.message });
    }

    const user = await authStore.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    authStore.clearRateLimit(identifier);
    try { await LoginAudit.create({ email, ipAddress, device, status: 'Success' }); } catch (_) {}

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id.toString());

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Verify OTP Error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getProfile = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      user: {
        id: req.user._id.toString(),
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        isActive: req.user.isActive,
        lastLogin: req.user.lastLogin,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const requestPasswordChangeOtp = async (req, res) => {
  try {
    const email = req.user.email;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    authStore.setOtp(email, otp);
    await sendOTPEmail(email, otp, req.user.name, 'login');
    return res.status(200).json({ success: true, message: 'OTP sent to your registered email' });
  } catch (error) {
    console.error('requestPasswordChangeOtp error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { otp, newPassword, confirmPassword } = req.body;

    if (!otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const email = req.user.email;
    const result = authStore.verifyOtp(email, otp);
    if (!result.success) {
      return res.status(401).json({ success: false, message: result.message });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('changePassword error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Forgot Password (public — no auth required) ──────────────────────────

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim(), isActive: true });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No active account found with this email address',
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // Use a namespaced key so forgot-password OTPs never collide with login OTPs
    authStore.setOtp(`forgot::${email.toLowerCase().trim()}`, otp);

    sendOTPEmail(user.email, otp, user.name, 'forgot-password').catch(err =>
      console.error('[AUTH] Forgot-password OTP email failed:', err.message)
    );

    return res.status(200).json({ success: true, message: 'OTP sent to your email address' });
  } catch (error) {
    console.error('forgotPassword error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const resetForgotPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const result = authStore.verifyOtp(`forgot::${email.toLowerCase().trim()}`, otp);
    if (!result.success) {
      return res.status(401).json({ success: false, message: result.message });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim(), isActive: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
    });
  } catch (error) {
    console.error('resetForgotPassword error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  login,
  verifyOtp,
  getProfile,
  requestPasswordChangeOtp,
  changePassword,
  forgotPassword,
  resetForgotPassword,
};
