const crypto = require('crypto');
const mongoose = require('mongoose');
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');
const auditService = require('./auditService');

const MAX_ENDPOINT_LENGTH = 2048;

function serviceError(code, status, message) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

function configureWebPush() {
  const config = pushConfig();
  if (!config) return null;
  try {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    return config;
  } catch (_error) {
    throw serviceError('PUSH_NOTIFICATIONS_UNAVAILABLE', 503, 'Push notifications are not configured correctly.');
  }
}

function publicPushKey() {
  const config = configureWebPush();
  if (!config) throw serviceError('PUSH_NOTIFICATIONS_UNAVAILABLE', 503, 'Push notifications are not configured yet.');
  return config.publicKey;
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0;
}

function normalizeSubscription(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw serviceError('VALIDATION_FAILED', 400, 'A valid browser push subscription is required.');
  }
  const endpoint = typeof input.endpoint === 'string' ? input.endpoint.trim() : '';
  const p256dh = typeof input.keys?.p256dh === 'string' ? input.keys.p256dh.trim() : '';
  const auth = typeof input.keys?.auth === 'string' ? input.keys.auth.trim() : '';
  if (!endpoint || endpoint.length > MAX_ENDPOINT_LENGTH || !p256dh || !auth || p256dh.length > 1024 || auth.length > 512) {
    throw serviceError('VALIDATION_FAILED', 400, 'A valid browser push subscription is required.');
  }

  let url;
  try {
    url = new URL(endpoint);
  } catch (_error) {
    throw serviceError('VALIDATION_FAILED', 400, 'A valid browser push subscription is required.');
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || hostname === 'localhost'
    || hostname.endsWith('.localhost') || hostname.endsWith('.local') || isPrivateIpv4(hostname)
    || hostname === '::1' || hostname.startsWith('fe80:')) {
    throw serviceError('VALIDATION_FAILED', 400, 'A valid browser push subscription is required.');
  }

  return {
    endpoint: url.toString(),
    keys: { p256dh, auth },
    expirationTime: Number.isFinite(input.expirationTime) ? input.expirationTime : null,
  };
}

function subscriptionTargetId(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
}

async function subscribe({ user, subscription, metadata = {} }) {
  const normalized = normalizeSubscription(subscription);
  const session = await mongoose.startSession();
  try {
    let saved;
    await session.withTransaction(async () => {
      saved = await PushSubscription.findOneAndUpdate(
        { endpoint: normalized.endpoint },
        { $set: { ...normalized, user: user.id || user._id } },
        { new: true, upsert: true, runValidators: true, session },
      );
      await auditService.record({
        actor: user.id || user._id,
        actorRole: user.role,
        action: 'push_subscription.upsert',
        targetType: 'push_subscription',
        targetId: subscriptionTargetId(normalized.endpoint),
        result: 'success',
        metadata: { ip: metadata.ip || '', userAgent: metadata.userAgent || '', reason: 'browser_push' },
        session,
      });
    });
    return saved;
  } finally {
    await session.endSession();
  }
}

async function unsubscribe({ user, endpoint, metadata = {} }) {
  if (typeof endpoint !== 'string' || !endpoint.trim() || endpoint.length > MAX_ENDPOINT_LENGTH) {
    throw serviceError('VALIDATION_FAILED', 400, 'A valid browser push subscription is required.');
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const removed = await PushSubscription.findOneAndDelete({ endpoint: endpoint.trim(), user: user.id || user._id }, { session });
      if (!removed) throw serviceError('PUSH_SUBSCRIPTION_NOT_FOUND', 404, 'Push subscription not found.');
      await auditService.record({
        actor: user.id || user._id,
        actorRole: user.role,
        action: 'push_subscription.delete',
        targetType: 'push_subscription',
        targetId: subscriptionTargetId(removed.endpoint),
        result: 'success',
        metadata: { ip: metadata.ip || '', userAgent: metadata.userAgent || '', reason: 'browser_push' },
        session,
      });
    });
  } finally {
    await session.endSession();
  }
}

async function deliverToUsers(userIds, notification) {
  const config = pushConfig();
  if (!config || !userIds.length) return { sent: 0, removed: 0, skipped: true };
  try {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  } catch (error) {
    console.error('Push notification configuration error:', error.message);
    return { sent: 0, removed: 0, skipped: true };
  }

  const subscriptions = await PushSubscription.find({ user: { $in: userIds } }).lean();
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    tag: notification.tag,
    url: notification.url,
  });
  let sent = 0;
  let removed = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload, { TTL: 60 * 60 });
      sent += 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id });
        removed += 1;
      } else {
        console.error(`Push delivery failed for subscription ${subscription._id}:`, error.message);
      }
    }
  }));
  return { sent, removed, skipped: false };
}

async function notifyAdmins(notification) {
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  return deliverToUsers(admins.map((admin) => admin._id), notification);
}

module.exports = {
  publicPushKey,
  subscribe,
  unsubscribe,
  deliverToUsers,
  notifyAdmins,
};
