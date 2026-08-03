const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const User = require('../src/models/User');
const Invitation = require('../src/models/Invitation');
const AuditEvent = require('../src/models/AuditEvent');
const auditService = require('../src/services/auditService');
const { authenticator } = require('otplib');
const { encryptSecret } = require('../src/utils/crypto');

const PASSWORD = 'correct horse battery staple';
const REPORT_CONTENT = 'private-report-content-must-never-be-audited';
const PASTOR_TOTP_SECRET = authenticator.generateSecret();

async function createUser({ email, role = 'user' }) {
  return User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email,
    password: PASSWORD,
    recoveryKeyHash: 'LEGACY-RECOVERY-KEY',
    role,
    ...(role === 'pastor' && { totp: { enabled: true, encryptedSecret: encryptSecret(PASTOR_TOTP_SECRET) } }),
  });
}

async function signedInCookies(app, email) {
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  let authCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token='));
  if (login.body.requiresTotp) {
    const pendingCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_pending='));
    const verified = await request(app)
      .post('/api/auth/totp/verify-login')
      .set('Cookie', [pendingCookie, csrfCookie])
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .send({ token: authenticator.generate(PASTOR_TOTP_SECRET) })
      .expect(200);
    authCookie = verified.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token='));
  }
  return { authCookie, csrfCookie, csrfToken: csrf.body.csrfToken };
}

function csrf(requestBuilder, cookies) {
  return requestBuilder.set('Cookie', [cookies.authCookie, cookies.csrfCookie]).set('X-CSRF-Token', cookies.csrfToken);
}

async function createInvitation(app, cookies, email = 'invitee@example.test') {
  const response = await csrf(request(app).post('/api/invitations'), cookies).send({ email }).expect(201);
  return response.body;
}

test('pastors can create invitations, while anonymous and non-pastor users cannot', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  await createUser({ email: 'leader@example.test' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const leaderCookies = await signedInCookies(app, 'leader@example.test');

  const created = await createInvitation(app, pastorCookies);
  assert.match(created.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(created.invitation.email, 'invitee@example.test');
  assert.equal(created.invitation.status, 'active');

  await request(app).post('/api/invitations').send({ email: 'nope@example.test' }).expect(401);
  await csrf(request(app).post('/api/invitations'), leaderCookies).send({ email: 'nope@example.test' }).expect(403);
  await request(app).post('/api/auth/register').send({}).expect(404);
});

test('inspection is neutral and redemption creates a session with one-time recovery codes', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const created = await createInvitation(app, pastorCookies, 'new.person@example.test');

  const inspect = await request(app).get(`/api/invitations/${created.token}`).expect(200);
  assert.deepEqual(Object.keys(inspect.body).sort(), ['invitation', 'valid']);
  assert.equal(inspect.body.valid, true);
  assert.equal(inspect.body.invitation.email, 'n***@example.test');
  assert.equal(inspect.body.invitation.expiresAt !== undefined, true);

  const redeem = await request(app)
    .post(`/api/invitations/${created.token}/redeem`)
    .send({
      firstName: 'New',
      lastName: 'Person',
      password: PASSWORD,
      email: 'new.person@example.test',
      reportContent: REPORT_CONTENT,
    })
    .expect(201);
  assert.equal(redeem.body.user.email, 'new.person@example.test');
  assert.equal(redeem.body.user.role, 'user');
  assert.equal(redeem.body.user.password, undefined);
  assert.equal(redeem.body.recoveryCodes.length, 8);
  assert.equal(new Set(redeem.body.recoveryCodes).size, 8);
  assert.ok(redeem.headers['set-cookie'].some((cookie) => cookie.startsWith('cmr_token=')));

  const user = await User.findOne({ email: 'new.person@example.test' }).select('+recoveryCodeHashes +recoveryKeyHash');
  assert.equal(user.recoveryCodeHashes.length, 8);
  assert.notEqual(user.recoveryCodeHashes[0], redeem.body.recoveryCodes[0]);
  assert.ok(user.recoveryKeyHash);
  await request(app).get('/api/auth/me').set('Cookie', redeem.headers['set-cookie']).expect(200);
  await request(app).post(`/api/invitations/${created.token}/redeem`).send({ firstName: 'New', lastName: 'Person', password: PASSWORD }).expect(400);

  const redemptionEvents = await AuditEvent.find({ action: 'invitation.redeem' }).lean();
  assert.deepEqual(redemptionEvents.map((event) => event.result).sort(), ['failure', 'success']);
  const auditText = JSON.stringify(redemptionEvents);
  for (const sensitiveValue of [created.token, 'new.person@example.test', PASSWORD, REPORT_CONTENT, ...redeem.body.recoveryCodes]) {
    assert.doesNotMatch(auditText, new RegExp(sensitiveValue));
  }
});

test('invalid invitation states and body email mismatch return the same neutral response', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const expired = await createInvitation(app, pastorCookies, 'expired@example.test');
  const revoked = await createInvitation(app, pastorCookies, 'revoked@example.test');
  const mismatch = await createInvitation(app, pastorCookies, 'matched@example.test');
  await Invitation.updateOne({ _id: expired.invitation.id }, { expiresAt: new Date(Date.now() - 1000) });
  await csrf(request(app).delete(`/api/invitations/${revoked.invitation.id}`), pastorCookies).expect(200);

  for (const token of [expired.token, revoked.token, 'not-a-real-invitation-token']) {
    const response = await request(app).get(`/api/invitations/${token}`).expect(400);
    assert.deepEqual(response.body, { code: 'INVALID_INVITATION', message: 'INVALID_INVITATION' });
  }
  for (const token of [expired.token, revoked.token]) {
    const response = await request(app)
      .post(`/api/invitations/${token}/redeem`)
      .send({ firstName: 'Invalid', lastName: 'Invitation', password: PASSWORD })
      .expect(400);
    assert.deepEqual(response.body, { code: 'INVALID_INVITATION', message: 'INVALID_INVITATION' });
  }
  const mismatchResponse = await request(app)
    .post(`/api/invitations/${mismatch.token}/redeem`)
    .send({ firstName: 'Mismatch', lastName: 'Rejected', password: PASSWORD, email: 'someone-else@example.test' })
    .expect(400);
  assert.equal(mismatchResponse.body.code, 'INVALID_INVITATION');
  assert.equal(await User.exists({ email: 'matched@example.test' }), null);
});

test('a pre-existing account cannot redeem an invitation for its email', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  await createUser({ email: 'existing@example.test' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const created = await createInvitation(app, pastorCookies, 'existing@example.test');

  const response = await request(app)
    .post(`/api/invitations/${created.token}/redeem`)
    .send({ firstName: 'Existing', lastName: 'Account', password: PASSWORD })
    .expect(400);
  assert.equal(response.body.code, 'INVALID_INVITATION');
  const invitation = await Invitation.findById(created.invitation.id);
  assert.equal(invitation.consumedAt, null);
});

test('parallel invitation creation leaves one active invitation and at most one redeemable token', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const completionOrder = [];
  const attempts = await Promise.all([1, 2].map(async () => {
    const response = await csrf(request(app).post('/api/invitations'), pastorCookies).send({ email: 'parallel@example.test' });
    if (response.status === 201) completionOrder.push(response);
    return response;
  }));
  assert.ok(attempts.every((response) => [201, 409].includes(response.status)));
  assert.ok(completionOrder.length >= 1);

  const activeInvitations = await Invitation.find({ email: 'parallel@example.test', active: true }).select('+active');
  assert.equal(activeInvitations.length, 1);
  const tokens = attempts.filter((response) => response.status === 201).map((response) => response.body.token);
  await request(app).get(`/api/invitations/${completionOrder.at(-1).body.token}`).expect(200);
  if (completionOrder.length > 1) {
    await request(app).get(`/api/invitations/${completionOrder.at(0).body.token}`).expect(400);
  }
  const revokedInvitations = await Invitation.find({ email: 'parallel@example.test', revokedAt: { $ne: null } });
  const revocationEvents = await AuditEvent.find({ action: 'invitation.revoke' }).lean();
  const auditedTargets = new Set(revocationEvents.map((event) => event.targetId));
  assert.ok(revokedInvitations.every((invitation) => auditedTargets.has(String(invitation._id))));
  const redemptions = await Promise.all(tokens.map((token) => request(app)
    .post(`/api/invitations/${token}/redeem`)
    .send({ firstName: 'Parallel', lastName: 'Invitee', password: PASSWORD })));
  assert.equal(redemptions.filter((response) => response.status === 201).length, 1);
  assert.ok(redemptions.every((response) => [201, 400].includes(response.status)));
});

test('failed transactional invitation creation or replacement audit leaves no changed invitation state', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const originalRecord = auditService.record;
  auditService.record = async (input) => {
    if (input.action === 'invitation.create' && input.session) throw new Error('audit write failed');
    return originalRecord(input);
  };
  try {
    await csrf(request(app).post('/api/invitations'), pastorCookies).send({ email: 'create-audit-failure@example.test' }).expect(500);
  } finally {
    auditService.record = originalRecord;
  }
  assert.equal(await Invitation.countDocuments({ email: 'create-audit-failure@example.test' }), 0);

  const existing = await createInvitation(app, pastorCookies, 'replacement-audit-failure@example.test');
  auditService.record = async (input) => {
    if (input.action === 'invitation.revoke' && input.session) throw new Error('audit write failed');
    return originalRecord(input);
  };
  try {
    await csrf(request(app).post('/api/invitations'), pastorCookies).send({ email: 'replacement-audit-failure@example.test' }).expect(500);
  } finally {
    auditService.record = originalRecord;
  }
  const invitations = await Invitation.find({ email: 'replacement-audit-failure@example.test' }).select('+active');
  assert.equal(invitations.length, 1);
  assert.equal(invitations[0].id, existing.invitation.id);
  assert.equal(invitations[0].active, true);
  assert.equal(invitations[0].revokedAt, null);
  await request(app).get(`/api/invitations/${existing.token}`).expect(200);
});

test('failed transactional revocation audit leaves the invitation active', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const created = await createInvitation(app, pastorCookies, 'revoke-audit-failure@example.test');
  const originalRecord = auditService.record;
  auditService.record = async (input) => {
    if (input.action === 'invitation.revoke' && input.session) throw new Error('audit write failed');
    return originalRecord(input);
  };
  try {
    await csrf(request(app).delete(`/api/invitations/${created.invitation.id}`), pastorCookies).expect(500);
  } finally {
    auditService.record = originalRecord;
  }
  const invitation = await Invitation.findById(created.invitation.id).select('+active');
  assert.equal(invitation.active, true);
  assert.equal(invitation.revokedAt, null);
  await request(app).get(`/api/invitations/${created.token}`).expect(200);
});

test('concurrent revocation and redemption have exactly one winner', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const created = await createInvitation(app, pastorCookies, 'race@example.test');
  const [revocation, redemption] = await Promise.all([
    csrf(request(app).delete(`/api/invitations/${created.invitation.id}`), pastorCookies),
    request(app)
      .post(`/api/invitations/${created.token}/redeem`)
      .send({ firstName: 'Race', lastName: 'Winner', password: PASSWORD }),
  ]);

  assert.ok([200, 409].includes(revocation.status));
  assert.ok([201, 400].includes(redemption.status));
  assert.equal(Number(revocation.status === 200) + Number(redemption.status === 201), 1);
  const invitation = await Invitation.findById(created.invitation.id).select('+active');
  assert.equal(invitation.active, false);
  assert.equal(Boolean(invitation.revokedAt), revocation.status === 200);
  assert.equal(Boolean(invitation.consumedAt), redemption.status === 201);
});

test('a failed transactional success audit rolls back redemption completely', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const created = await createInvitation(app, pastorCookies, 'rollback@example.test');
  const originalRecord = auditService.record;
  auditService.record = async (input) => {
    if (input.action === 'invitation.redeem' && input.result === 'success') throw new Error('audit write failed');
    return originalRecord(input);
  };
  try {
    await request(app)
      .post(`/api/invitations/${created.token}/redeem`)
      .send({ firstName: 'Rollback', lastName: 'Test', password: PASSWORD })
      .expect(500);
  } finally {
    auditService.record = originalRecord;
  }

  const invitation = await Invitation.findById(created.invitation.id).select('+active');
  assert.equal(invitation.active, true);
  assert.equal(invitation.consumedAt, null);
  assert.equal(await User.exists({ email: 'rollback@example.test' }), null);
  assert.equal(await AuditEvent.exists({ action: 'invitation.redeem', result: 'success' }), null);
  await request(app)
    .post(`/api/invitations/${created.token}/redeem`)
    .send({ firstName: 'Rollback', lastName: 'Test', password: PASSWORD })
    .expect(201);
});

test('public inspection and redemption endpoints are independently rate limited by IP', async (t) => {
  const app = await createTestApp(t, { invitationRateLimits: { inspectLimit: 2, redeemLimit: 2 } });
  for (let index = 0; index < 2; index += 1) {
    await request(app).get(`/api/invitations/unknown-inspection-${index}`).expect(400);
    await request(app)
      .post(`/api/invitations/unknown-redemption-${index}/redeem`)
      .send({ firstName: 'Rate', lastName: 'Limited', password: PASSWORD })
      .expect(400);
  }
  const inspectionLimit = await request(app).get('/api/invitations/unknown-inspection-limited').expect(429);
  const redemptionLimit = await request(app)
    .post('/api/invitations/unknown-redemption-limited/redeem')
    .send({ firstName: 'Rate', lastName: 'Limited', password: PASSWORD })
    .expect(429);
  assert.equal(inspectionLimit.body.code, 'RATE_LIMITED');
  assert.equal(redemptionLimit.body.code, 'RATE_LIMITED');
  assert.ok(inspectionLimit.headers.ratelimit);
  assert.ok(redemptionLimit.headers.ratelimit);
});

test('regenerating an invitation revokes its predecessor and no plaintext token is retained', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const first = await createInvitation(app, pastorCookies, 'same@example.test');
  const second = await createInvitation(app, pastorCookies, 'same@example.test');

  const old = await Invitation.findById(first.invitation.id).lean();
  const fresh = await Invitation.findById(second.invitation.id).lean();
  assert.ok(old.revokedAt);
  assert.equal(fresh.revokedAt, null);
  assert.equal(old.tokenHash, undefined);
  const raw = await Invitation.collection.findOne({ _id: fresh._id });
  assert.notEqual(raw.tokenHash, second.token);
  assert.equal(raw.token, undefined);
  await request(app).get(`/api/invitations/${first.token}`).expect(400);
});

test('listing and revocation are pastor-only and invitation audit records exclude sensitive content', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  await createUser({ email: 'leader@example.test' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const leaderCookies = await signedInCookies(app, 'leader@example.test');
  const created = await createInvitation(app, pastorCookies, 'audit.person@example.test');

  await request(app).get('/api/invitations').expect(401);
  await request(app).get('/api/invitations').set('Cookie', leaderCookies.authCookie).expect(403);
  const listed = await request(app).get('/api/invitations').set('Cookie', pastorCookies.authCookie).expect(200);
  assert.equal(listed.body.invitations.length, 1);
  await csrf(request(app).delete(`/api/invitations/${created.invitation.id}`), leaderCookies).expect(403);
  await csrf(request(app).delete(`/api/invitations/${created.invitation.id}`), pastorCookies).expect(200);

  const auditText = JSON.stringify(await AuditEvent.find().lean());
  assert.doesNotMatch(auditText, new RegExp(created.token));
  assert.doesNotMatch(auditText, /audit\.person@example\.test/);
  assert.doesNotMatch(auditText, /report content/i);
  assert.match(auditText, /invitation\.create/);
  assert.match(auditText, /invitation\.revoke/);
});

test('invitation listing is paginated and retention uses a 30-day TTL index', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  await createInvitation(app, pastorCookies, 'page-one@example.test');
  await createInvitation(app, pastorCookies, 'page-two@example.test');
  await createInvitation(app, pastorCookies, 'page-three@example.test');

  const response = await request(app)
    .get('/api/invitations?page=2&limit=1')
    .set('Cookie', pastorCookies.authCookie)
    .expect(200);
  assert.equal(response.body.invitations.length, 1);
  assert.deepEqual(response.body.pagination, {
    page: 2,
    limit: 1,
    total: 3,
    totalPages: 3,
    hasNextPage: true,
  });
  const bounded = await request(app)
    .get('/api/invitations?limit=1000')
    .set('Cookie', pastorCookies.authCookie)
    .expect(200);
  assert.equal(bounded.body.pagination.limit, 100);
  const ttlIndex = Invitation.schema.indexes().find(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds);
  assert.equal(ttlIndex[1].expireAfterSeconds, 30 * 24 * 60 * 60);
});
