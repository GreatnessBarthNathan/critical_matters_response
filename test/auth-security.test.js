const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const User = require('../src/models/User');
const AuditEvent = require('../src/models/AuditEvent');
const { authenticator } = require('otplib');
const auditService = require('../src/services/auditService');
const authService = require('../src/services/authService');
const seedAdmin = require('../src/utils/seedAdmin');
const seedTechSupport = require('../src/utils/seedTechSupport');
const { validateBootstrapAccounts } = require('../server');
const { encryptSecret, hashToken } = require('../src/utils/crypto');

function setEnvironmentForTest(t, values) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function createUser() {
  return User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    password: 'correct horse battery staple',
    recoveryKeyHash: 'RECOVERY-KEY',
  });
}

async function signIn(app, email = 'ada@example.test') {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'correct horse battery staple' })
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
  assert.equal(missingResponse.body.error.code, 'CSRF_INVALID');
  await request(app)
    .post('/api/auth/logout')
    .set('Cookie', [authCookie, csrfCookie.replace(csrfResponse.body.csrfToken, forgedToken)])
    .set('X-CSRF-Token', forgedToken)
    .expect(403);
});

test('legacy recovery-key password reset endpoint is retired', async (t) => {
  const app = await createTestApp(t);
  // The route is absent, so it answers 404 with or without CSRF values.
  await request(app).post('/api/auth/reset-password').send({}).expect(404);

  const csrfResponse = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrfResponse.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  await request(app)
    .post('/api/auth/reset-password')
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrfResponse.body.csrfToken)
    .send({ email: 'ada@example.test', recoveryKey: 'RECOVERY-KEY', newPassword: 'a newer secure password' })
    .expect(404);
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
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
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

test('an unconfigured admin can use the workspace before optional TOTP enrolment', async (t) => {
  const app = await createTestApp(t);
  await User.create({
    firstName: 'Lead', lastName: 'Pastor', email: 'pastor@example.test', role: 'admin',
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
  await request(app).get('/api/reports').set('Cookie', authCookie).expect(200);
  await request(app).get('/api/invitations').set('Cookie', authCookie).expect(403);
  await request(app).get('/api/users').set('Cookie', authCookie).expect(403);

  await User.create({
    firstName: 'Tech', lastName: 'Support', email: 'support@example.test', role: 'tech_support',
    password: 'correct horse battery staple', recoveryKeyHash: 'SUPPORT-LEGACY-KEY',
  });
  const supportCookie = await signIn(app, 'support@example.test');
  await request(app).get('/api/invitations').set('Cookie', supportCookie).expect(200);
  await request(app).get('/api/users').set('Cookie', supportCookie).expect(200);

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
    .set('Cookie', [supportCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: 'new.leader@example.test' })
    .expect(201);
});

test('tech-support-assisted reset is single use, neutral on failure, and revokes the leader session', async (t) => {
  const app = await createTestApp(t);
  const leader = await User.create({
    firstName: 'Leader', lastName: 'One', email: 'leader@example.test', password: 'correct horse battery staple', recoveryKeyHash: 'LEADER-LEGACY-KEY',
  });
  await User.create({
    firstName: 'Tech', lastName: 'Support', email: 'support@example.test', role: 'tech_support', password: 'correct horse battery staple', recoveryKeyHash: 'SUPPORT-LEGACY-KEY',
  });
  const leaderCookie = await request(app).post('/api/auth/login').send({ email: 'leader@example.test', password: 'correct horse battery staple' })
    .expect(200).then((response) => response.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token=')));
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const supportCookie = await signIn(app, 'support@example.test');
  const issued = await request(app)
    .post(`/api/users/${leader.id}/reset-code`)
    .set('Cookie', [supportCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({})
    .expect(201);
  assert.match(issued.body.resetCode, /^[A-Za-z0-9_-]{32}$/);
  const resetEvent = await AuditEvent.findOne({ action: 'auth.assisted-reset.issue', targetId: leader.id }).lean();
  assert.equal(resetEvent.actorRole, 'tech_support');

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
  assert.equal(reused.body.error.code, 'INVALID_RECOVERY');
});

test('one recovery code has exactly one winner under concurrent reset attempts', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  const bcrypt = require('bcryptjs');
  user.recoveryCodeHashes = [await bcrypt.hash('CONCURRENT-RECOVERY-CODE', 12)];
  await user.save();
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const sendRecovery = () => request(app)
    .post('/api/auth/recover-with-code')
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: 'ada@example.test', recoveryCode: 'CONCURRENT-RECOVERY-CODE', newPassword: 'a newer secure password' });
  const attempts = await Promise.all([sendRecovery(), sendRecovery()]);
  assert.equal(attempts.filter((response) => response.status === 200).length, 1);
  assert.equal(attempts.filter((response) => response.status === 400).length, 1);
  assert.equal((await User.findById(user.id).select('+recoveryCodeHashes')).recoveryCodeHashes.length, 0);
});

test('regeneration replaces every recovery code and password change rotates the session', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  const bcrypt = require('bcryptjs');
  user.recoveryCodeHashes = [await bcrypt.hash('OLD-RECOVERY-CODE', 12)];
  await user.save();
  const oldCookie = await signIn(app);
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const regenerated = await request(app)
    .post('/api/auth/recovery-codes/regenerate')
    .set('Cookie', [oldCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .expect(200);
  assert.equal(regenerated.body.recoveryCodes.length, 8);
  assert.equal(new Set(regenerated.body.recoveryCodes).size, 8);
  const oldCode = await request(app)
    .post('/api/auth/recover-with-code')
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: 'ada@example.test', recoveryCode: 'OLD-RECOVERY-CODE', newPassword: 'a newer secure password' })
    .expect(400);
  assert.equal(oldCode.body.error.code, 'INVALID_RECOVERY');
  const changed = await request(app)
    .patch('/api/auth/change-password')
    .set('Cookie', [oldCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ currentPassword: 'correct horse battery staple', newPassword: 'a newer secure password' })
    .expect(200);
  const refreshedCookie = changed.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token='));
  await request(app).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
  await request(app).get('/api/auth/me').set('Cookie', refreshedCookie).expect(200);
});

test('TOTP setup and confirmation have independent rate limits', async (t) => {
  const app = await createTestApp(t, { authRateLimits: { totpSetupLimit: 1, totpConfirmLimit: 1 } });
  await createUser();
  const authCookie = await signIn(app);
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const setup = await request(app)
    .post('/api/auth/totp/setup')
    .set('Cookie', [authCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .expect(200);
  await request(app)
    .post('/api/auth/totp/setup')
    .set('Cookie', [authCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .expect(429);
  const setupCookie = setup.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_setup='));
  await request(app)
    .post('/api/auth/totp/confirm')
    .set('Cookie', [authCookie, csrfCookie, setupCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: '000000' })
    .expect(401);
  await request(app)
    .post('/api/auth/totp/confirm')
    .set('Cookie', [authCookie, csrfCookie, setupCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: '000000' })
    .expect(429);
});

test('successful login updates and audits roll back together when required audit writes fail', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  const originalRecord = auditService.record;
  auditService.record = async (input) => {
    if (input.action === 'auth.login' && input.session) throw new Error('audit write failed');
    return originalRecord(input);
  };
  try {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.test', password: 'correct horse battery staple' })
      .expect(500);
  } finally {
    auditService.record = originalRecord;
  }
  assert.equal((await User.findById(user.id)).lastLoginAt, undefined);

  const secret = authenticator.generateSecret();
  user.totp = { enabled: true, encryptedSecret: encryptSecret(secret) };
  await user.save();
  const pending = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ada@example.test', password: 'correct horse battery staple' })
    .expect(200);
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  auditService.record = async (input) => {
    if (input.action === 'auth.login' && input.session) throw new Error('audit write failed');
    return originalRecord(input);
  };
  try {
    await request(app)
      .post('/api/auth/totp/verify-login')
      .set('Cookie', [pending.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_pending=')), csrfCookie])
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ token: authenticator.generate(secret) })
      .expect(500);
  } finally {
    auditService.record = originalRecord;
  }
  assert.equal((await User.findById(user.id)).lastLoginAt, undefined);
});

test('expired assisted reset is neutral and deactivation permanently revokes old sessions', async (t) => {
  const app = await createTestApp(t);
  const leader = await createUser();
  const resetCode = 'expired-assisted-reset-code';
  await User.updateOne({ _id: leader.id }, {
    $set: { 'assistedReset.tokenHash': hashToken(resetCode), 'assistedReset.expiresAt': new Date(Date.now() - 1000) },
  });
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const expired = await request(app)
    .post('/api/auth/assisted-reset')
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: 'ada@example.test', resetCode, newPassword: 'a newer secure password' })
    .expect(400);
  assert.equal(expired.body.error.code, 'INVALID_RECOVERY');

  const support = await User.create({
    firstName: 'Tech', lastName: 'Support', email: 'support@example.test', role: 'tech_support', password: 'correct horse battery staple',
  });
  const leaderCookie = await signIn(app);
  const supportCookie = await signIn(app, support.email);
  await request(app)
    .patch(`/api/users/${leader.id}/status`)
    .set('Cookie', [supportCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ isActive: false })
    .expect(200);
  await request(app).get('/api/auth/me').set('Cookie', leaderCookie).expect(401);
  await request(app)
    .patch(`/api/users/${leader.id}/status`)
    .set('Cookie', [supportCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ isActive: true })
    .expect(200);
  await request(app).get('/api/auth/me').set('Cookie', leaderCookie).expect(401);
});

test('pastor bootstrap preserves an existing password and TOTP state while new pastors begin at setup', async (t) => {
  const app = await createTestApp(t);
  const previous = {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_FIRST_NAME: process.env.ADMIN_FIRST_NAME,
    ADMIN_LAST_NAME: process.env.ADMIN_LAST_NAME,
  };
  const secret = authenticator.generateSecret();
  const existing = await User.create({
    firstName: 'Existing', lastName: 'Pastor', email: 'bootstrap@example.test', role: 'admin', password: 'original secure password',
    totp: { enabled: true, encryptedSecret: encryptSecret(secret) },
  });
  try {
    process.env.ADMIN_EMAIL = existing.email;
    process.env.ADMIN_PASSWORD = 'replacement secure password';
    await seedAdmin();
    const preserved = await User.findById(existing.id).select('+password +totp.encryptedSecret');
    assert.equal(await preserved.comparePassword('original secure password'), true);
    assert.equal(preserved.totp.enabled, true);
    assert.equal(preserved.totp.encryptedSecret, existing.totp.encryptedSecret);

    process.env.ADMIN_EMAIL = 'new-bootstrap@example.test';
    process.env.ADMIN_PASSWORD = 'new pastor secure password';
    await seedAdmin();
    const newPastor = await User.findOne({ email: process.env.ADMIN_EMAIL }).select('+recoveryCodeHashes');
    assert.equal(newPastor.totp.enabled, false);
    assert.deepEqual(newPastor.recoveryCodeHashes, []);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: newPastor.email, password: 'new pastor secure password' })
      .expect(200);
    const authCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token='));
    const csrf = await request(app).get('/api/auth/csrf').expect(200);
    const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
    await request(app).get('/api/reports').set('Cookie', authCookie).expect(403);
    await request(app)
      .post('/api/auth/totp/setup')
      .set('Cookie', [authCookie, csrfCookie])
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .expect(200);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('tech support bootstrap creates a configured account with the restricted role', async (t) => {
  await createTestApp(t);
  setEnvironmentForTest(t, {
    TECH_SUPPORT_EMAIL: 'support-bootstrap@example.test',
    TECH_SUPPORT_PASSWORD: 'support bootstrap password',
    TECH_SUPPORT_FIRST_NAME: undefined,
    TECH_SUPPORT_LAST_NAME: undefined,
  });

  await seedTechSupport();

  const support = await User.findOne({ email: process.env.TECH_SUPPORT_EMAIL }).select('+password');
  assert.equal(support.firstName, 'Tech');
  assert.equal(support.lastName, 'Support');
  assert.equal(support.role, 'tech_support');
  assert.equal(await support.comparePassword('support bootstrap password'), true);
});

test('tech support bootstrap promotes an existing account without changing its password', async (t) => {
  await createTestApp(t);
  const existing = await User.create({
    firstName: 'Existing', lastName: 'Leader', email: 'support-bootstrap@example.test', password: 'original secure password',
  });
  setEnvironmentForTest(t, {
    TECH_SUPPORT_EMAIL: existing.email,
    TECH_SUPPORT_PASSWORD: 'replacement secure password',
    TECH_SUPPORT_FIRST_NAME: 'Ignored',
    TECH_SUPPORT_LAST_NAME: 'Values',
  });

  await seedTechSupport();

  const promoted = await User.findById(existing.id).select('+password');
  assert.equal(promoted.role, 'tech_support');
  assert.equal(promoted.firstName, 'Existing');
  assert.equal(promoted.lastName, 'Leader');
  assert.equal(await promoted.comparePassword('original secure password'), true);
});

test('tech support bootstrap does nothing without both credentials', async (t) => {
  await createTestApp(t);
  setEnvironmentForTest(t, {
    TECH_SUPPORT_EMAIL: 'support-bootstrap@example.test',
    TECH_SUPPORT_PASSWORD: undefined,
    TECH_SUPPORT_FIRST_NAME: undefined,
    TECH_SUPPORT_LAST_NAME: undefined,
  });

  await seedTechSupport();

  assert.equal(await User.countDocuments({}), 0);
});

test('bootstrap accounts reject matching normalized addresses and allow distinct or missing support configuration', () => {
  assert.throws(
    () => validateBootstrapAccounts({ ADMIN_EMAIL: ' Pastor@example.test ', TECH_SUPPORT_EMAIL: 'pastor@EXAMPLE.test' }),
    /ADMIN_EMAIL and TECH_SUPPORT_EMAIL must be different addresses/,
  );
  assert.doesNotThrow(() => validateBootstrapAccounts({
    ADMIN_EMAIL: 'pastor@example.test', TECH_SUPPORT_EMAIL: 'support@example.test',
  }));
  assert.doesNotThrow(() => validateBootstrapAccounts({ ADMIN_EMAIL: 'pastor@example.test' }));
});

test('status changes are audited transactionally and audit failures roll back session revocation', async (t) => {
  const app = await createTestApp(t);
  const leader = await createUser();
  const support = await User.create({
    firstName: 'Tech', lastName: 'Support', email: 'support@example.test', role: 'tech_support', password: 'correct horse battery staple',
  });
  const supportCookie = await signIn(app, support.email);
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  await request(app)
    .patch(`/api/users/${leader.id}/status`)
    .set('Cookie', [supportCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ isActive: false })
    .expect(200);
  const success = await AuditEvent.findOne({ action: 'account.status_changed', targetId: leader.id }).lean();
  assert.equal(String(success.actor), String(support.id));
  assert.equal(success.actorRole, 'tech_support');
  assert.deepEqual(success.metadata.changedFields, ['isActive']);

  const before = await User.findById(leader.id);
  const originalRecord = auditService.record;
  auditService.record = async (input) => {
    if (input.action === 'account.status_changed' && input.session) throw new Error('audit write failed');
    return originalRecord(input);
  };
  try {
    await request(app)
      .patch(`/api/users/${leader.id}/status`)
      .set('Cookie', [supportCookie, csrfCookie])
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ isActive: true })
      .expect(500);
  } finally {
    auditService.record = originalRecord;
  }
  const unchanged = await User.findById(leader.id);
  assert.equal(unchanged.isActive, before.isActive);
  assert.equal(unchanged.sessionVersion, before.sessionVersion);
});

test('logout records a safe event and still clears every auth cookie if auditing is unavailable', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  const authCookie = await signIn(app);
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const loggedOut = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', [authCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .expect(200);
  const event = await AuditEvent.findOne({ action: 'auth.logout', targetId: user.id }).lean();
  assert.equal(String(event.actor), String(user.id));
  assert.equal(event.actorRole, 'user');
  for (const name of ['cmr_token=', 'cmr_totp_pending=', 'cmr_totp_setup=']) {
    assert.ok(loggedOut.headers['set-cookie'].some((cookie) => cookie.startsWith(name)));
  }

  const originalRecord = auditService.record;
  auditService.record = async () => { throw new Error('audit unavailable'); };
  try {
    const outage = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [authCookie, csrfCookie])
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .expect(200);
    assert.ok(outage.headers['set-cookie'].some((cookie) => cookie.startsWith('cmr_token=')));
  } finally {
    auditService.record = originalRecord;
  }
});

test('fingerprinted recovery codes select one bcrypt candidate while unknown requests use the dummy pathway', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  user.recoveryCodeHashes = await authService.hashRecoveryCodes(['FINGERPRINTED-RECOVERY-CODE']);
  await user.save();
  const bcrypt = require('bcryptjs');
  const originalCompare = bcrypt.compare;
  let comparisons = 0;
  bcrypt.compare = async (...args) => {
    comparisons += 1;
    return originalCompare(...args);
  };
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  try {
    await request(app)
      .post('/api/auth/recover-with-code')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ email: 'unknown@example.test', recoveryCode: 'FINGERPRINTED-RECOVERY-CODE', newPassword: 'a newer secure password' })
      .expect(400);
    assert.equal(comparisons, 1);
    comparisons = 0;
    await request(app)
      .post('/api/auth/recover-with-code')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ email: user.email, recoveryCode: 'FINGERPRINTED-RECOVERY-CODE', newPassword: 'a newer secure password' })
      .expect(200);
    assert.equal(comparisons, 1);
  } finally {
    bcrypt.compare = originalCompare;
  }
});

test('pending TOTP challenges are one-time, concurrent-safe, and invalidated by password recovery', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  const secret = authenticator.generateSecret();
  user.totp = { enabled: true, encryptedSecret: encryptSecret(secret) };
  user.recoveryCodeHashes = await authService.hashRecoveryCodes(['PENDING-INVALIDATION-CODE']);
  await user.save();
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'correct horse battery staple' }).expect(200);
  const pendingCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_pending='));
  const verify = () => request(app)
    .post('/api/auth/totp/verify-login')
    .set('Cookie', [pendingCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: authenticator.generate(secret) });
  const attempts = await Promise.all([verify(), verify()]);
  assert.equal(attempts.filter((response) => response.status === 200).length, 1);
  assert.equal(attempts.filter((response) => response.status === 401).length, 1);
  await verify().expect(401);

  const secondLogin = await request(app).post('/api/auth/login').send({ email: user.email, password: 'correct horse battery staple' }).expect(200);
  const secondPending = secondLogin.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_pending='));
  await request(app)
    .post('/api/auth/recover-with-code')
    .set('Cookie', csrfCookie)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ email: user.email, recoveryCode: 'PENDING-INVALIDATION-CODE', newPassword: 'a newer secure password' })
    .expect(200);
  await request(app)
    .post('/api/auth/totp/verify-login')
    .set('Cookie', [secondPending, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: authenticator.generate(secret) })
    .expect(401);
});

test('replacing an enabled TOTP secret requires the current password and current authenticator code', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  const oldSecret = authenticator.generateSecret();
  user.totp = { enabled: true, encryptedSecret: encryptSecret(oldSecret) };
  await user.save();
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'correct horse battery staple' }).expect(200);
  const pendingCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_pending='));
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const authCookie = await request(app)
    .post('/api/auth/totp/verify-login')
    .set('Cookie', [pendingCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: authenticator.generate(oldSecret) })
    .expect(200)
    .then((response) => response.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token=')));
  for (const body of [
    {},
    { currentPassword: 'wrong password', currentTotp: authenticator.generate(oldSecret) },
    { currentPassword: 'correct horse battery staple', currentTotp: '000000' },
  ]) {
    await request(app)
      .post('/api/auth/totp/setup')
      .set('Cookie', [authCookie, csrfCookie])
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send(body)
      .expect(401);
  }
  const allowed = await request(app)
    .post('/api/auth/totp/setup')
    .set('Cookie', [authCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ currentPassword: 'correct horse battery staple', currentTotp: authenticator.generate(oldSecret) })
    .expect(200);
  assert.match(allowed.body.otpauthUrl, /^otpauth:\/\/totp\//);
});

test('TOTP setup confirmation has one winner and stale setup state cannot survive password rotation', async (t) => {
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
  const secret = new URL(setup.body.otpauthUrl).searchParams.get('secret');
  const confirm = () => request(app)
    .post('/api/auth/totp/confirm')
    .set('Cookie', [authCookie, csrfCookie, setupCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: authenticator.generate(secret) });
  const confirmations = await Promise.all([confirm(), confirm()]);
  assert.equal(confirmations.filter((response) => response.status === 200).length, 1);
  assert.equal(confirmations.filter((response) => response.status === 401).length, 1);

  const secondUser = await User.create({ firstName: 'Second', lastName: 'Leader', email: 'second@example.test', password: 'correct horse battery staple' });
  const secondCookie = await request(app).post('/api/auth/login').send({ email: secondUser.email, password: 'correct horse battery staple' })
    .expect(200).then((response) => response.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token=')));
  const staleSetup = await request(app)
    .post('/api/auth/totp/setup')
    .set('Cookie', [secondCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .expect(200);
  const refreshed = await request(app)
    .patch('/api/auth/change-password')
    .set('Cookie', [secondCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ currentPassword: 'correct horse battery staple', newPassword: 'a newer secure password' })
    .expect(200);
  const refreshedCookie = refreshed.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token='));
  const staleSecret = new URL(staleSetup.body.otpauthUrl).searchParams.get('secret');
  await request(app)
    .post('/api/auth/totp/confirm')
    .set('Cookie', [refreshedCookie, csrfCookie, staleSetup.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_setup='))])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: authenticator.generate(staleSecret) })
    .expect(401);
});

test('replacement TOTP confirmation is compare-and-set under concurrent confirmation', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  const oldSecret = authenticator.generateSecret();
  user.totp = { enabled: true, version: 0, encryptedSecret: encryptSecret(oldSecret) };
  await user.save();
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'correct horse battery staple' }).expect(200);
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const authCookie = await request(app)
    .post('/api/auth/totp/verify-login')
    .set('Cookie', [login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_pending=')), csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: authenticator.generate(oldSecret) })
    .expect(200)
    .then((response) => response.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token=')));
  const setup = await request(app)
    .post('/api/auth/totp/setup')
    .set('Cookie', [authCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ currentPassword: 'correct horse battery staple', currentTotp: authenticator.generate(oldSecret) })
    .expect(200);
  const setupCookie = setup.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_setup='));
  const newSecret = new URL(setup.body.otpauthUrl).searchParams.get('secret');
  const confirm = () => request(app)
    .post('/api/auth/totp/confirm')
    .set('Cookie', [authCookie, csrfCookie, setupCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: authenticator.generate(newSecret) });
  const confirmations = await Promise.all([confirm(), confirm()]);
  assert.equal(confirmations.filter((response) => response.status === 200).length, 1);
  assert.equal(confirmations.filter((response) => response.status === 401).length, 1);
  assert.equal((await User.findById(user.id)).totp.version, 1);
});

test('initial TOTP confirmation migrates raw documents without a stored totp version', async (t) => {
  const app = await createTestApp(t);
  const user = await createUser();
  await User.collection.updateOne({ _id: user._id }, { $unset: { 'totp.version': 1 } });
  const authCookie = await signIn(app);
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  const setup = await request(app)
    .post('/api/auth/totp/setup')
    .set('Cookie', [authCookie, csrfCookie])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .expect(200);
  const secret = new URL(setup.body.otpauthUrl).searchParams.get('secret');
  await request(app)
    .post('/api/auth/totp/confirm')
    .set('Cookie', [authCookie, csrfCookie, setup.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_setup='))])
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send({ token: authenticator.generate(secret) })
    .expect(200);
  const raw = await User.collection.findOne({ _id: user._id });
  assert.equal(raw.totp.version, 1);
});

test('recovery peppers rotate independently from JWT and login failures use one bcrypt comparison', async (t) => {
  const app = await createTestApp(t);
  const oldPepper = process.env.RECOVERY_CODE_PEPPER;
  const oldPrevious = process.env.RECOVERY_CODE_PREVIOUS_PEPPERS;
  const user = await createUser();
  try {
    process.env.RECOVERY_CODE_PEPPER = 'a'.repeat(40);
    process.env.RECOVERY_CODE_PREVIOUS_PEPPERS = '';
    const oldEntry = (await authService.hashRecoveryCodes(['ROTATED-RECOVERY-CODE']))[0];
    user.recoveryCodeHashes = [oldEntry];
    await user.save();
    process.env.RECOVERY_CODE_PEPPER = 'b'.repeat(40);
    process.env.RECOVERY_CODE_PREVIOUS_PEPPERS = 'a'.repeat(40);
    const newEntry = (await authService.hashRecoveryCodes(['NEW-ROTATED-RECOVERY-CODE']))[0];
    assert.notEqual(newEntry.keyId, oldEntry.keyId);
    const csrf = await request(app).get('/api/auth/csrf').expect(200);
    const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
    await request(app)
      .post('/api/auth/recover-with-code')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ email: user.email, recoveryCode: 'ROTATED-RECOVERY-CODE', newPassword: 'a newer secure password' })
      .expect(200);

    const bcrypt = require('bcryptjs');
    const originalCompare = bcrypt.compare;
    let comparisons = 0;
    bcrypt.compare = async (...args) => { comparisons += 1; return originalCompare(...args); };
    try {
      for (const email of ['unknown@example.test', user.email]) {
        await request(app).post('/api/auth/login').send({ email, password: 'incorrect password' }).expect(401);
        assert.equal(comparisons, 1);
        comparisons = 0;
      }
      await User.updateOne({ _id: user.id }, { isActive: false });
      await request(app).post('/api/auth/login').send({ email: user.email, password: 'incorrect password' }).expect(401);
      assert.equal(comparisons, 1);
    } finally {
      bcrypt.compare = originalCompare;
    }
  } finally {
    process.env.RECOVERY_CODE_PEPPER = oldPepper;
    if (oldPrevious === undefined) delete process.env.RECOVERY_CODE_PREVIOUS_PEPPERS;
    else process.env.RECOVERY_CODE_PREVIOUS_PEPPERS = oldPrevious;
  }
});
