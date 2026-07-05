const User = require('../models/User');

exports.listUsers = async (req, res) => {
  try {
    const users = await User.find(
      { role: { $ne: 'SuperAdmin' } },
      'name email role isActive createdAt lastLogin'
    ).sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('listUsers error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Name, email, password and role are required' });
    }
    if (role === 'SuperAdmin') {
      return res.status(400).json({ success: false, message: 'Cannot create SuperAdmin from this interface' });
    }
    if (!['Admin', 'Manager', 'Staff'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be Admin, Manager, or Staff' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      const who = existing.role === 'SuperAdmin'
        ? 'the SuperAdmin account'
        : `an existing ${existing.role} member`;
      return res.status(409).json({
        success: false,
        message: `This email is already registered as ${who}. Please check your member list.`,
        existingRole: existing.role,
      });
    }

    const user = await User.create({ name: name.trim(), email, password, role });
    res.status(201).json({
      success: true,
      message: 'Member created successfully',
      data: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This email is already registered. Please check your member list.' });
    }
    console.error('createUser error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { name, role } = req.body;
    const user = await User.findById(req.params.id);

    if (!user || user.role === 'SuperAdmin') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (role === 'SuperAdmin') {
      return res.status(400).json({ success: false, message: 'Cannot promote to SuperAdmin' });
    }
    if (role && !['Admin', 'Manager', 'Staff'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be Admin, Manager, or Staff' });
    }

    if (name) user.name = name.trim();
    if (role) user.role = role;
    await user.save();

    res.json({ success: true, message: 'Member updated', data: user });
  } catch (error) {
    console.error('updateUser error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user || user.role === 'SuperAdmin') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: `Member ${user.isActive ? 'enabled' : 'disabled'} successfully`,
      data: { isActive: user.isActive },
    });
  } catch (error) {
    console.error('toggleStatus error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.resetMemberPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await User.findById(req.params.id);

    if (!user || user.role === 'SuperAdmin') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('resetMemberPassword error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
