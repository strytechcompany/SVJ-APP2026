const jwt = require('jsonwebtoken');
const authStore = require('../services/authStore');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await authStore.getUserById(decoded.id);

      if (!user) {
        return res.status(401).json({ success: false, message: 'Account is inactive or not found' });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Token is invalid or expired' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token, authorization denied' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized for this action`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
