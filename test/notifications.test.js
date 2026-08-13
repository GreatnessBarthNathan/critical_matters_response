const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const webpush = require('web-push');
const { createTestApp } = require('./helpers/testApp');
const User = require('../src/models/User');
const PushSubscription = require('../src/models/PushSubscription');
const AuditEvent = require('../src/models/AuditEvent');
const pushNotificationService = require('../src/services/pushNotificationService');

const PASSWORD = 'correct horse battery staple';

async function createUser(email) {
  return User.create({
    firstName: 'Ada', lastName: 'Lovelace', email, password: PASSWORD, recoveryKeyHash: 'LEGACY-RECOVERY-KEY',
  });
}

async function signedInCookies(app, email) {
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  const csrfResponse = await request(app).get('/api/auth/csrf').expect(200);
  return {
    authCookie: login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token=')),
    csrfCookie: csrfResponse.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf=')),
    csrfToken: csrfResponse.body.csrfToken,
  };
}

function csrf(requestBuilder, cookies) {
  return requestBuilder.set('Cookie', [cookies.authCookie, cookies.csrfCookie]).set('X-CSRF-Token', cookies.csrfToken);
}

function authed(requestBuilder, cookies) {
  return requestBuilder.set('Cookie', [cookies.authCookie, cookies.csrfCookie]);
}

function subscription(endpoint = 'https://fcm.googleapis.com/fcm/send/example-subscription') {
  return { endpoint, expirationTime: null, keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-key' } };
}

function restoreVapid(environment) {
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('push subscriptions are opt-in, device-scoped, audited, and protected by CSRF', async (t) => {
  const vapid = webpush.generateVAPIDKeys();
  const prior = {
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  };
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:notifications@example.test';
  t.after(() => restoreVapid(prior));

  const app = await createTestApp(t);
  const first = await createUser('first@example.test');
  await createUser('second@example.test');
  const firstCookies = await signedInCookies(app, first.email);
  const secondCookies = await signedInCookies(app, 'second@example.test');

  await request(app).get('/api/notifications/public-key').expect(401);
  const key = await authed(request(app).get('/api/notifications/public-key'), firstCookies).expect(200);
  assert.equal(key.body.publicKey, vapid.publicKey);

  await request(app).post('/api/notifications/subscriptions').set('Cookie', firstCookies.authCookie).send({ subscription: subscription() }).expect(403);
  await csrf(request(app).post('/api/notifications/subscriptions'), firstCookies).send({ subscription: subscription() }).expect(201);
  const stored = await PushSubscription.findOne({ endpoint: subscription().endpoint });
  assert.equal(String(stored.user), String(first.id));

  const audit = await AuditEvent.findOne({ action: 'push_subscription.upsert' });
  assert.equal(String(audit.actor), String(first.id));
  assert.notEqual(audit.targetId, subscription().endpoint);

  await csrf(request(app).delete('/api/notifications/subscriptions'), secondCookies).send({ endpoint: subscription().endpoint }).expect(404);
  await csrf(request(app).delete('/api/notifications/subscriptions'), firstCookies).send({ endpoint: subscription().endpoint }).expect(204);
  assert.equal(await PushSubscription.countDocuments(), 0);
});

test('push configuration and subscriptions fail closed on missing configuration or unsafe endpoints', async (t) => {
  const prior = {
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  };
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
  t.after(() => restoreVapid(prior));

  const app = await createTestApp(t);
  await createUser('member@example.test');
  const cookies = await signedInCookies(app, 'member@example.test');
  const disabled = await authed(request(app).get('/api/notifications/public-key'), cookies).expect(503);
  assert.equal(disabled.body.error.code, 'PUSH_NOTIFICATIONS_UNAVAILABLE');

  const unsafe = await csrf(request(app).post('/api/notifications/subscriptions'), cookies)
    .send({ subscription: subscription('https://127.0.0.1/private') })
    .expect(400);
  assert.equal(unsafe.body.error.code, 'VALIDATION_FAILED');
});

test('tech support cannot configure push notifications or receive deliveries after a role change', async (t) => {
  const vapid = webpush.generateVAPIDKeys();
  const prior = {
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  };
  const originalSendNotification = webpush.sendNotification;
  const deliveredEndpoints = [];
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:notifications@example.test';
  webpush.sendNotification = async ({ endpoint }) => { deliveredEndpoints.push(endpoint); };
  t.after(() => {
    restoreVapid(prior);
    webpush.sendNotification = originalSendNotification;
  });

  const app = await createTestApp(t);
  const recipient = await createUser('recipient@example.test');
  const support = await User.create({
    firstName: 'Tech', lastName: 'Support', email: 'support@example.test', password: PASSWORD, role: 'tech_support',
  });
  const supportCookies = await signedInCookies(app, support.email);

  await authed(request(app).get('/api/notifications/public-key'), supportCookies).expect(403);
  await csrf(request(app).post('/api/notifications/subscriptions'), supportCookies).send({ subscription: subscription() }).expect(403);
  await csrf(request(app).delete('/api/notifications/subscriptions'), supportCookies).send({ endpoint: subscription().endpoint }).expect(403);

  await PushSubscription.create([
    { user: recipient.id, ...subscription('https://fcm.googleapis.com/fcm/send/eligible-recipient') },
    { user: support.id, ...subscription('https://fcm.googleapis.com/fcm/send/support-recipient') },
  ]);
  const result = await pushNotificationService.deliverToUsers([recipient.id, support.id], {
    title: 'New private response', body: 'A response is ready.', tag: 'report-1', url: '/app/reports/1',
  });

  assert.equal(result.sent, 1);
  assert.deepEqual(deliveredEndpoints, ['https://fcm.googleapis.com/fcm/send/eligible-recipient']);
});
