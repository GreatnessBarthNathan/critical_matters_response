const User = require('../models/User');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const auditService = require('../services/auditService');

function supportAccountView(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    isActive: user.isActive,
  };
}

exports.updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['firstName', 'lastName', 'phone', 'ministry', 'bio', 'avatarColor'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) req.user[field] = req.body[field];
  });
  await req.user.save();
  res.json({ user: req.user.toSafeObject(), message: 'Profile updated.' });
});

exports.listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find({ role: 'user' })
    .select('firstName lastName email isActive')
    .sort({ createdAt: -1 });
  res.json({
    users: users.map(supportAccountView),
  });
});

exports.setUserStatus = asyncHandler(async (req, res) => {
  const isActive = Boolean(req.body.isActive);
  const session = await mongoose.startSession();
  let user;
  try {
    await session.withTransaction(async () => {
      user = await User.findOneAndUpdate(
        { _id: req.params.id, role: 'user', isActive: { $ne: isActive } },
        {
          $set: { isActive, 'pendingTotp.jtiHash': '', 'pendingTotp.expiresAt': null },
          $inc: { sessionVersion: 1 },
        },
        { new: true, session },
      );
      if (!user) {
        user = await User.findOne({ _id: req.params.id, role: 'user' }).session(session);
        if (!user) {
          const error = new Error('User not found.');
          error.status = 404;
          throw error;
        }
        return;
      }
      await auditService.record({
        actor: req.user.id, actorRole: req.user.role, action: 'account.status_changed', targetType: 'user', targetId: user.id,
        result: 'success', metadata: { ip: req.ip, userAgent: req.get('user-agent'), changedFields: ['isActive'] }, session,
      });
    });
  } finally {
    await session.endSession();
  }
  res.json({ user: supportAccountView(user), message: `Account ${user.isActive ? 'activated' : 'deactivated'}.` });
});

exports.issueResetCode = asyncHandler(async (req, res) => {
  const result = await authService.issueAssistedReset({
    leaderId: req.params.id,
    pastor: req.user,
    metadata: { ip: req.ip, userAgent: req.get('user-agent') },
  });
  res.status(201).json({
    resetCode: result.resetCode,
    expiresAt: result.expiresAt,
    message: 'Give this one-time reset code to the leader after personal verification. It will not be shown again.',
  });
});
