const User = require('../models/User');
const Report = require('../models/Report');
const asyncHandler = require('../utils/asyncHandler');

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
  const user = await User.findOne({ _id: req.params.id, role: 'user' });
  if (!user) {
    res.status(404);
    throw new Error('User not found.');
  }
  user.isActive = Boolean(req.body.isActive);
  await user.save();
  res.json({ user: user.toSafeObject(), message: `Account ${user.isActive ? 'activated' : 'deactivated'}.` });
});
