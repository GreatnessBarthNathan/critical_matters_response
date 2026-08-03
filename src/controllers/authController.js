const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const generateRecoveryKey = require('../utils/recoveryKey');
const { signToken, setAuthCookie } = require('../utils/authToken');

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

exports.register = asyncHandler(async (req, res) => {
  const { firstName, lastName, password } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!firstName?.trim() || !lastName?.trim() || !email || !validatePassword(password)) {
    res.status(400);
    throw new Error('First name, last name, a valid email, and a password of at least 8 characters are required.');
  }

  if (await User.exists({ email })) {
    res.status(409);
    throw new Error('An account with this email already exists.');
  }

  const recoveryKey = generateRecoveryKey();
  const user = await User.create({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email,
    password,
    recoveryKeyHash: recoveryKey,
  });

  setAuthCookie(res, signToken(user.id));
  res.status(201).json({
    user: user.toSafeObject(),
    recoveryKey,
    message: 'Account created. Save your recovery key somewhere safe; it will not be shown again.',
  });
});

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
  setAuthCookie(res, signToken(user.id));
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
