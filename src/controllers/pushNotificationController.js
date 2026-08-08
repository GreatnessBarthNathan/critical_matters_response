const asyncHandler = require('../utils/asyncHandler');
const pushNotificationService = require('../services/pushNotificationService');

function metadata(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

exports.publicKey = asyncHandler(async (_req, res) => {
  res.json({ publicKey: pushNotificationService.publicPushKey() });
});

exports.subscribe = asyncHandler(async (req, res) => {
  await pushNotificationService.subscribe({ user: req.user, subscription: req.body?.subscription, metadata: metadata(req) });
  res.status(201).json({ message: 'Push notifications enabled for this device.' });
});

exports.unsubscribe = asyncHandler(async (req, res) => {
  await pushNotificationService.unsubscribe({ user: req.user, endpoint: req.body?.endpoint, metadata: metadata(req) });
  res.status(204).end();
});
