const User = require('../models/User');
const Report = require('../models/Report');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const auditService = require('../services/auditService');

exports.updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['firstName', 'lastName', 'phone', 'ministry', 'bio', 'avatarColor'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) req.user[field] = req.body[field];
  });
  await req.user.save();
  res.json({ user: req.user.toSafeObject(), message: 'Profile updated.' });
});

exports.listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find({ role: 'user' }).sort({ createdAt: -1 });
  const counts = await Report.aggregate([
    { $group: { _id: '$owner', reportCount: { $sum: 1 }, openCount: { $sum: { $cond: [{ $ne: ['$status', 'closed'] }, 1, 0] } } } },
  ]);
  const countMap = new Map(counts.map((item) => [String(item._id), item]));
  res.json({
    users: users.map((user) => ({
      ...user.toSafeObject(),
      reportCount: countMap.get(String(user.id))?.reportCount || 0,
      openCount: countMap.get(String(user.id))?.openCount || 0,
    })),
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
        actor: req.user.id, actorRole: 'pastor', action: 'account.status_changed', targetType: 'user', targetId: user.id,
        result: 'success', metadata: { ip: req.ip, userAgent: req.get('user-agent'), changedFields: ['isActive'] }, session,
      });
    });
  } finally {
    await session.endSession();
  }
  res.json({ user: user.toSafeObject(), message: `Account ${user.isActive ? 'activated' : 'deactivated'}.` });
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
