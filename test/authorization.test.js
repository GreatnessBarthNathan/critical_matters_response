const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const User = require('../src/models/User');
const { authenticator } = require('otplib');
const { encryptSecret } = require('../src/utils/crypto');

const PASSWORD = 'correct horse battery staple';
const PASTOR_TOTP_SECRET = authenticator.generateSecret();

async function createUser({ email, role = 'user', firstName = 'Ada' }) {
  return User.create({
    firstName,
    lastName: 'Lovelace',
    email,
    password: PASSWORD,
    recoveryKeyHash: 'LEGACY-RECOVERY-KEY',
    role,
    ...(role === 'admin' && { totp: { enabled: true, encryptedSecret: encryptSecret(PASTOR_TOTP_SECRET) } }),
  });
}

async function signedInCookies(app, email) {
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  const csrfResponse = await request(app).get('/api/auth/csrf').expect(200);
  const csrfCookie = csrfResponse.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_csrf='));
  let authCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token='));
  if (login.body.requiresTotp) {
    const pendingCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_totp_pending='));
    const verified = await request(app)
      .post('/api/auth/totp/verify-login')
      .set('Cookie', [pendingCookie, csrfCookie])
      .set('X-CSRF-Token', csrfResponse.body.csrfToken)
      .send({ token: authenticator.generate(PASTOR_TOTP_SECRET) })
      .expect(200);
    authCookie = verified.headers['set-cookie'].find((cookie) => cookie.startsWith('cmr_token='));
  }
  return { authCookie, csrfCookie, csrfToken: csrfResponse.body.csrfToken };
}

function csrf(requestBuilder, cookies) {
  return requestBuilder.set('Cookie', [cookies.authCookie, cookies.csrfCookie]).set('X-CSRF-Token', cookies.csrfToken);
}

function authed(requestBuilder, cookies) {
  return requestBuilder.set('Cookie', [cookies.authCookie, cookies.csrfCookie]);
}

async function createReport(app, cookies) {
  const response = await csrf(request(app).post('/api/reports'), cookies)
    .send({
      title: 'Confidential family matter',
      category: 'general',
      urgency: 'normal',
      content: 'Only the owning leader and the pastor may ever read this text.',
    })
    .expect(201);
  return response.body.report;
}

async function buildMatrixFixture(t) {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'admin' });
  await createUser({ email: 'owner@example.test', firstName: 'Owner' });
  await createUser({ email: 'other@example.test', firstName: 'Other' });
  const pastor = await signedInCookies(app, 'pastor@example.test');
  const owner = await signedInCookies(app, 'owner@example.test');
  const other = await signedInCookies(app, 'other@example.test');
  const report = await createReport(app, owner);
  return { app, pastor, owner, other, report };
}

test('privacy matrix rejects every anonymous report operation with 401', async (t) => {
  const { app, report } = await buildMatrixFixture(t);

  await request(app).get('/api/reports').expect(401);
  await request(app).get('/api/reports/stats').expect(401);
  await request(app).get(`/api/reports/${report._id}`).expect(401);
  await request(app).post('/api/reports').send({ title: 'x', content: 'y' }).expect(401);
  await request(app).patch(`/api/reports/${report._id}`).send({ title: 'x' }).expect(401);
  await request(app).post(`/api/reports/${report._id}/responses`).send({ message: 'x' }).expect(401);
  await request(app).patch(`/api/reports/${report._id}/status`).send({ status: 'archived' }).expect(401);
  await request(app).get('/api/audit').expect(401);
  await request(app).get('/api/invitations').expect(401);
  await request(app).get('/api/users').expect(401);
});

test('privacy matrix allows the owning leader every self-service report operation', async (t) => {
  const { app, owner, report } = await buildMatrixFixture(t);

  await authed(request(app).get('/api/reports'), owner).expect(200);
  await authed(request(app).get('/api/reports/stats'), owner).expect(200);
  const detail = await authed(request(app).get(`/api/reports/${report._id}`), owner).expect(200);
  assert.equal(detail.body.report.reference, report.reference);
  await csrf(request(app).patch(`/api/reports/${report._id}`), owner).send({ title: 'Revised subject' }).expect(200);
  await csrf(request(app).post(`/api/reports/${report._id}/responses`), owner).send({ message: 'A further update.' }).expect(201);

  const withRevisions = await authed(request(app).get(`/api/reports/${report._id}`), owner).expect(200);
  assert.equal(withRevisions.body.report.revisions.length, 1);

  // Leaders never reach pastor administration, even with a valid session and CSRF token.
  const forbiddenAudit = await authed(request(app).get('/api/audit'), owner).expect(403);
  assert.equal(forbiddenAudit.body.error.code, 'FORBIDDEN');
  await authed(request(app).get('/api/invitations'), owner).expect(403);
  await csrf(request(app).post('/api/invitations'), owner).send({ email: 'x@example.test' }).expect(403);
  await authed(request(app).get('/api/users'), owner).expect(403);
  await csrf(request(app).patch(`/api/reports/${report._id}/status`), owner).send({ status: 'archived' }).expect(403);
});

test('privacy matrix hides a report from every other leader', async (t) => {
  const { app, other, report } = await buildMatrixFixture(t);

  const detail = await authed(request(app).get(`/api/reports/${report._id}`), other).expect(404);
  assert.equal(detail.body.error.code, 'REPORT_NOT_FOUND');
  await csrf(request(app).patch(`/api/reports/${report._id}`), other).send({ title: 'Rewrite' }).expect(404);
  await csrf(request(app).post(`/api/reports/${report._id}/responses`), other).send({ message: 'Reply' }).expect(404);

  const list = await authed(request(app).get('/api/reports'), other).expect(200);
  assert.equal(list.body.reports.length, 0);
  const stats = await authed(request(app).get('/api/reports/stats'), other).expect(200);
  assert.equal(stats.body.stats.total, 0);
});

test('privacy matrix lets the pastor triage without rewriting leader text', async (t) => {
  const { app, pastor, report } = await buildMatrixFixture(t);

  const list = await authed(request(app).get('/api/reports'), pastor).expect(200);
  assert.equal(list.body.reports.length, 1);
  const detail = await authed(request(app).get(`/api/reports/${report._id}`), pastor).expect(200);
  assert.equal(detail.body.report.status, 'in_review');
  assert.deepEqual(detail.body.report.revisions, []);

  await csrf(request(app).post(`/api/reports/${report._id}/responses`), pastor).send({ message: 'Praying with you.' }).expect(201);
  await csrf(request(app).patch(`/api/reports/${report._id}/status`), pastor).send({ status: 'archived' }).expect(200);

  const rewrite = await csrf(request(app).patch(`/api/reports/${report._id}`), pastor)
    .send({ content: 'A pastor must never rewrite the original words.' })
    .expect(403);
  assert.equal(rewrite.body.error.code, 'REPORT_FORBIDDEN');

  await authed(request(app).get('/api/audit'), pastor).expect(200);
  await authed(request(app).get('/api/invitations'), pastor).expect(200);
  await authed(request(app).get('/api/users'), pastor).expect(200);
});

test('audit route is pastor-only, filterable, paginated and free of sensitive content', async (t) => {
  const { app, pastor, owner, report } = await buildMatrixFixture(t);

  // The pastor's first access opens the matter; every later read is a plain view.
  await authed(request(app).get(`/api/reports/${report._id}`), pastor).expect(200);
  await authed(request(app).get(`/api/reports/${report._id}`), owner).expect(200);
  await csrf(request(app).patch(`/api/reports/${report._id}`), owner).send({ title: 'Revised subject' }).expect(200);
  await csrf(request(app).patch(`/api/reports/${report._id}/status`), pastor).send({ status: 'archived' }).expect(200);

  const all = await authed(request(app).get('/api/audit'), pastor).expect(200);
  const actions = all.body.events.map((event) => event.action);
  for (const required of ['report.create', 'report.open', 'report.view', 'report.edit', 'report.transition', 'auth.login']) {
    assert.ok(actions.includes(required), `${required} must be audited`);
  }

  // Newest first, and never carrying the confidential text of a matter.
  const timestamps = all.body.events.map((event) => new Date(event.createdAt).getTime());
  assert.deepEqual(timestamps, [...timestamps].sort((a, b) => b - a));
  assert.doesNotMatch(JSON.stringify(all.body), /Only the owning leader|Revised subject|Confidential family matter/);
  for (const event of all.body.events) {
    assert.deepEqual(
      Object.keys(event).sort(),
      ['action', 'actor', 'actorRole', 'createdAt', 'id', 'metadata', 'result', 'targetId', 'targetType'],
    );
    for (const key of Object.keys(event.metadata)) {
      assert.ok(['ip', 'userAgent', 'requestId', 'reason', 'changedFields'].includes(key), `unsafe metadata key ${key}`);
    }
  }

  const filtered = await authed(request(app).get('/api/audit?action=report.edit'), pastor).expect(200);
  assert.ok(filtered.body.events.length > 0);
  assert.deepEqual([...new Set(filtered.body.events.map((event) => event.action))], ['report.edit']);

  const byTarget = await authed(request(app).get('/api/audit?targetType=report&result=success'), pastor).expect(200);
  assert.deepEqual([...new Set(byTarget.body.events.map((event) => event.targetType))], ['report']);

  const byActor = await authed(request(app).get(`/api/audit?actor=${report.owner._id || report.owner}`), pastor).expect(200);
  assert.ok(byActor.body.events.length > 0);
  assert.deepEqual([...new Set(byActor.body.events.map((event) => String(event.actor?.id ?? event.actor)))], [String(report.owner._id || report.owner)]);

  const paged = await authed(request(app).get('/api/audit?page=1&limit=2'), pastor).expect(200);
  assert.equal(paged.body.events.length, 2);
  assert.equal(paged.body.pagination.limit, 2);
  assert.equal(paged.body.pagination.page, 1);
  assert.ok(paged.body.pagination.total >= 5);

  const futureOnly = await authed(request(app).get('/api/audit?from=2999-01-01'), pastor).expect(200);
  assert.equal(futureOnly.body.events.length, 0);

  const invalidFilter = await authed(request(app).get('/api/audit?result=maybe'), pastor).expect(400);
  assert.equal(invalidFilter.body.error.code, 'VALIDATION_FAILED');
});

test('errors use the stable envelope and never leak stack traces', async (t) => {
  const { app, owner } = await buildMatrixFixture(t);

  const notFound = await request(app).get('/api/not-a-route').expect(404);
  assert.deepEqual(Object.keys(notFound.body).sort(), ['error']);
  assert.equal(notFound.body.error.code, 'NOT_FOUND');
  assert.deepEqual(notFound.body.error.fields, {});
  assert.match(notFound.body.error.requestId, /^[A-Za-z0-9_-]{8,}$/);
  assert.equal(notFound.body.error.stack, undefined);

  const unauthorized = await request(app).get('/api/reports').expect(401);
  assert.equal(unauthorized.body.error.code, 'UNAUTHENTICATED');

  const invalid = await csrf(request(app).post('/api/reports'), owner).send({ title: '', content: '' }).expect(400);
  assert.equal(invalid.body.error.code, 'VALIDATION_FAILED');
  assert.equal(typeof invalid.body.error.message, 'string');

  // Neutral codes must not reveal whether an account or invitation exists.
  const badLogin = await request(app).post('/api/auth/login').send({ email: 'nobody@example.test', password: 'wrong' }).expect(401);
  assert.equal(badLogin.body.error.code, 'INVALID_CREDENTIALS');
  const badInvitation = await request(app).get('/api/invitations/not-a-real-token').expect(400);
  assert.equal(badInvitation.body.error.code, 'INVALID_INVITATION');
});
