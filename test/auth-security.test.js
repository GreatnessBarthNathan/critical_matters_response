const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const User = require('../src/models/User');
const { authenticator } = require('otplib');

async function createUser() {
  return User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    password: 'correct horse battery staple',
    recoveryKeyHash: 'RECOVERY-KEY',
  });
}

async function signIn(app) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ada@example.test', password: 'correct horse battery staple' })
    .expect(200);
  return response.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token='));
}

test('rejects a state-changing request using an authenticated cookie without matching CSRF values', async (t) => {
  const app = await createTestApp(t);
  await createUser();
  const authCookie = await signIn(app);

  await request(app)
    .post('/api/auth/logout')
    .set('Cookie', authCookie)
    .expect(403);
});

test('GET /api/auth/csrf returns a token and sets a readable CSRF cookie', async (t) => {
  const app = await createTestApp(t);

  const response = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = response.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));

  assert.match(response.body.csrfToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.match(csrfCookie, /^cmr_csrf=[^;]+; Path=\//);
  assert.doesNotMatch(csrfCookie, /HttpOnly/i);
});

test('matching signed CSRF cookie and header pass validation', async (t) => {
  const app = await createTestApp(t);
  await createUser();
  const authCookie = await signIn(app);
  const csrfResponse = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrfResponse.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));

  await request(app)
    .post('/api/auth/logout')
    .set('Cookie', [authCookie, csrfCookie])
    .set('X-CSRF-Token', csrfResponse.body.csrfToken)
    .expect(200);
});

test('missing or forged CSRF values are rejected with a stable error code', async (t) => {
  const app = await createTestApp(t);
  await createUser();
  const authCookie = await signIn(app);
  const csrfResponse = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrfResponse.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const forgedToken = `${csrfResponse.body.csrfToken.slice(0, -1)}x`;

  const missingResponse = await request(app).post('/api/auth/logout').set('Cookie', authCookie).expect(403);
  assert.equal(missingResponse.body.code, 'CSRF_INVALID');
  await request(app)
    .post('/api/auth/logout')
    .set('Cookie', [authCookie, csrfCookie.replace(csrfResponse.body.csrfToken, forgedToken)])
    .set('X-CSRF-Token', forgedToken)
    .expect(403);
});

test('password reset requires CSRF and accepts a valid issued token before validation', async (t) => {
  const app = await createTestApp(t);
  await request(app).post('/api/auth/reset-password').send({}).expect(403);

  const csrfResponse = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrfResponse.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  await request(app)
    .post('/api/auth/reset-password')
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrfResponse.body.csrfToken)
    .send({})
    .expect(400);
});

test('revoked session version is rejected', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  const oldCookie = await signIn(app);

  user.sessionVersion += 1;
  await user.save();

  await request(app).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
});

test('public invitation inspection and redemption are CSRF-exempt while administration remains protected', async (t) => {
  const app = await createTestApp(t);

  await request(app).get('/api/invitations/invitation-token').expect(400);
  await request(app).post('/api/invitations/invitation-token/redeem').send({}).expect(400);
  await request(app).post('/api/invitations').send({}).expect(401);
});

test('TOTP login remains pending until a valid authenticator code is supplied', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  const secret = authenticator.generateSecret();
  const { encryptSecret } = require('../src/utils/crypto');
  user.totp = { enabled: true, encryptedSecret: encryptSecret(secret) };
  await user.save();

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ada@example.test', password: 'correct horse battery staple' })
    .expect(200);
  assert.equal(login.body.requiresTotp, true);
  assert.equal(login.headers['set-cookie'].some((cookie) => cookie.startsWith('cmr_token=')), false);
  const pendingCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_pending='));
  await request(app).get('/api/auth/me').set('Cookie', pendingCookie).expect(401);
  await request(app).get('/api/reports').set('Cookie', pendingCookie).expect(401);

  const csrfResponse = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrfResponse.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const verified = await request(app)
    .post('/api/auth/totp/verify-login')
    .set('Cookie', [pendingCookie, csrfCookie])
    .set('X-CSRF-Token', csrfResponse.body.csrfToken)
    .send({ token: authenticator.generate(secret) })
    .expect(200);
  assert.ok(verified.headers['set-cookie'].some((cookie) => cookie.startsWith('cmr_token=')));
});

test('TOTP verification rejects wrong-purpose and expired pending tokens before its independent rate limit', async (t) => {
  const app = await createTestApp(t, { authRateLimits: { totpLimit: 2 } });
  const user = await createUser();
  const jwt = require('jsonwebtoken');
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const wrongPurpose = jwt.sign({ sub: user.id, purpose: 'totp-setup' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const expired = jwt.sign({ sub: user.id, purpose: 'totp-login' }, process.env.JWT_SECRET, { expiresIn: -1 });
  for (const pendingToken of [wrongPurpose, expired]) {
    await request(app)
      .post('/api/auth/totp/verify-login')
      .set('Cookie', [`cmr_totp_pending=${pendingToken}`, csrfCookie])
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ token: '000000' })
      .expect(401);
  }
  const limited = await request(app)
    .post('/api/auth/totp/verify-login')
    .set('Cookie', [`cmr_totp_pending=${wrongPurpose}`, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: '000000' })
    .expect(429);
  assert.equal(limited.body.code, 'RATE_LIMITED');
});

test('recovery codes are one-time and revoke existing sessions when used', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  const bcrypt = require('bcryptjs');
  user.recoveryCodeHashes = [await bcrypt.hash('ONE-TIME-RECOVERY-CODE', 12)];
  await user.save();
  const oldCookie = await signIn(app);
  const csrfResponse = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrfResponse.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));

  await request(app)
    .post('/api/auth/recover-with-code')
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrfResponse.body.csrfToken)
    .send({ email: 'ada@example.test', recoveryCode: 'ONE-TIME-RECOVERY-CODE', newPassword: 'a newer secure password' })
    .expect(200);
  await request(app).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
  await request(app)
    .post('/api/auth/recover-with-code')
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrfResponse.body.csrfToken)
    .send({ email: 'ada@example.test', recoveryCode: 'ONE-TIME-RECOVERY-CODE', newPassword: 'a newer secure password' })
    .expect(400);
});

test('TOTP setup is provisional until confirmation and issues recovery codes only after confirmation', async (t) => {
  const app = await createTestApp(t);
  await createUser();
  const authCookie = await signIn(app);
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const setup = await request(app)
    .post('/api/auth/totp/setup')
    .set('Cookie', [authCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .expect(200);
  const setupCookie = setup.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_setup='));
  assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);
  assert.match(setup.body.qrDataUrl, /^data:image\/png;base64,/);
  assert.equal((await User.findOne({ email: 'ada@example.test' })).totp.enabled, false);

  await request(app)
    .post('/api/auth/totp/confirm')
    .set('Cookie', [authCookie, csrfCookie, setupCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: '000000' })
    .expect(401);
  assert.equal((await User.findOne({ email: 'ada@example.test' })).totp.enabled, false);

  const secret = new URL(setup.body.otpauthUrl).searchParams.get('secret');
  const confirmed = await request(app)
    .post('/api/auth/totp/confirm')
    .set('Cookie', [authCookie, csrfCookie, setupCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: authenticator.generate(secret) })
    .expect(200);
  assert.equal(confirmed.body.recoveryCodes.length, 8);
  assert.equal((await User.findOne({ email: 'ada@example.test' })).totp.enabled, true);
  const relogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ada@example.test', password: 'correct horse battery staple' })
    .expect(200);
  assert.equal(relogin.body.requiresTotp, true);
});

test('an unconfigured pastor is limited to setup until TOTP confirmation', async (t) => {
  const app = await createTestApp(t);
  await User.create({
    firstName: 'Lead', lastName: 'Pastor', email: 'pastor@example.test', role: 'pastor',
    password: 'correct horse battery staple', recoveryKeyHash: 'PASTOR-LEGACY-KEY',
  });
  const authCookie = await request(app)
    .post('/api/auth/login')
    .send({ email: 'pastor@example.test', password: 'correct horse battery staple' })
    .expect(200)
    .then((response) => response.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token=')));
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  await request(app).get('/api/auth/me').set('Cookie', authCookie).expect(200);
  const blocked = await request(app).get('/api/reports').set('Cookie', authCookie).expect(403);
  assert.equal(blocked.body.code, 'PASTOR_TOTP_REQUIRED');
  await request(app).get('/api/invitations').set('Cookie', authCookie).expect(403);
  await request(app).get('/api/users').set('Cookie', authCookie).expect(403);

  const setup = await request(app)
    .post('/api/auth/totp/setup')
    .set('Cookie', [authCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .expect(200);
  const setupCookie = setup.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_setup='));
  const secret = new URL(setup.body.otpauthUrl).searchParams.get('secret');
  await request(app)
    .post('/api/auth/totp/confirm')
    .set('Cookie', [authCookie, csrfCookie, setupCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: authenticator.generate(secret) })
    .expect(200);
  await request(app)
    .post('/api/invitations')
    .set('Cookie', [authCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: 'new.leader@example.test' })
    .expect(201);
});

test('pastor-assisted reset is single use, neutral on failure, and revokes the leader session', async (t) => {
  const app = await createTestApp(t);
  const leader = await User.create({
    firstName: 'Leader', lastName: 'One', email: 'leader@example.test', password: 'correct horse battery staple', recoveryKeyHash: 'LEADER-LEGACY-KEY',
  });
  const secret = authenticator.generateSecret();
  const { encryptSecret } = require('../src/utils/crypto');
  await User.create({
    firstName: 'Lead', lastName: 'Pastor', email: 'pastor@example.test', role: 'pastor', password: 'correct horse battery staple', recoveryKeyHash: 'PASTOR-LEGACY-KEY',
    totp: { enabled: true, encryptedSecret: encryptSecret(secret) },
  });
  const leaderCookie = await request(app).post('/api/auth/login').send({ email: 'leader@example.test', password: 'correct horse battery staple' })
    .expect(200).then((response) => response.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token=')));
  const login = await request(app).post('/api/auth/login').send({ email: 'pastor@example.test', password: 'correct horse battery staple' }).expect(200);
  const pendingCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_pending='));
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const pastorCookie = await request(app)
    .post('/api/auth/totp/verify-login')
    .set('Cookie', [pendingCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: authenticator.generate(secret) })
    .expect(200)
    .then((response) => response.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token=')));
  const issued = await request(app)
    .post(`/api/users/${leader.id}/reset-code`)
    .set('Cookie', [pastorCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({})
    .expect(201);
  assert.match(issued.body.resetCode, /^[A-Za-z0-9_-]{32}$/);

  await request(app)
    .post('/api/auth/assisted-reset')
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: 'leader@example.test', resetCode: issued.body.resetCode, newPassword: 'a newer secure password' })
    .expect(200);
  await request(app).get('/api/auth/me').set('Cookie', leaderCookie).expect(401);
  const reused = await request(app)
    .post('/api/auth/assisted-reset')
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: 'leader@example.test', resetCode: issued.body.resetCode, newPassword: 'a newer secure password' })
    .expect(400);
  assert.equal(reused.body.code, 'INVALID_RECOVERY');
});
