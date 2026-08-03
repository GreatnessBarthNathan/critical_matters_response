const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const User = require('../src/models/User');
const Invitation = require('../src/models/Invitation');
const AuditEvent = require('../src/models/AuditEvent');

const PASSWORD = 'correct horse battery staple';

async function createUser({ email, role = 'user' }) {
  return User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email,
    password: PASSWORD,
    recoveryKeyHash: 'LEGACY-RECOVERY-KEY',
    role,
  });
}

async function signedInCookies(app, email) {
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  const authCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token='));
  const csrf = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrf.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
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
    .send({ firstName: 'New', lastName: 'Person', password: PASSWORD, email: 'new.person@example.test' })
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
