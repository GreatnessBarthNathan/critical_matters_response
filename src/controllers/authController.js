const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { signToken, setAuthCookie } = require('../utils/authToken');

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

exports.login = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  const user = await User.findOne({ email }).select('+password');

  if (!user || !user.isActive || !(await user.comparePassword(password || ''))) {
    res.status(401);
    throw new Error('The email or password is incorrect.');
  }

  user.lastLoginAt = new Date();
  await user.save();
  setAuthCookie(res, signToken(user));
  res.json({ user: user.toSafeObject(), message: 'Welcome back.' });
});

exports.logout = asyncHandler(async (_req, res) => {
  res.clearCookie('cmr_token', { httpOnly: true, sameSite: 'lax', path: '/' });
  res.json({ message: 'You have been signed out.' });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const recoveryKey = String(req.body.recoveryKey || '').trim().toUpperCase();
  const { newPassword } = req.body;

  if (!email || !recoveryKey || !validatePassword(newPassword)) {
    res.status(400);
    throw new Error('Email, recovery key, and a new password of at least 8 characters are required.');
  }

  const user = await User.findOne({ email }).select('+recoveryKeyHash +password');
  if (!user || !(await user.compareRecoveryKey(recoveryKey))) {
    res.status(400);
    throw new Error('The email and recovery key do not match our records.');
  }

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();
  res.json({ message: 'Password reset successfully. You can now sign in.' });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!validatePassword(newPassword)) {
    res.status(400);
    throw new Error('The new password must contain at least 8 characters.');
  }

  const user = await User.findById(req.user.id).select('+password');
  if (!(await user.comparePassword(currentPassword || ''))) {
    res.status(400);
    throw new Error('Your current password is incorrect.');
  }

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();
  res.json({ message: 'Password changed successfully.' });
});
