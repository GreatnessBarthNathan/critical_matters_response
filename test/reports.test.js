const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const User = require('../src/models/User');
const Report = require('../src/models/Report');
const AuditEvent = require('../src/models/AuditEvent');
const auditService = require('../src/services/auditService');
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
    ...(role === 'pastor' && { totp: { enabled: true, encryptedSecret: encryptSecret(PASTOR_TOTP_SECRET) } }),
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

async function createReport(app, cookies, overrides = {}) {
  const response = await csrf(request(app).post('/api/reports'), cookies)
    .send({
      title: 'Family matter needing prayer',
      category: 'family',
      sensitivity: 'standard',
      urgency: 'normal',
      content: 'Details of the confidential matter that only the owner and pastor may read.',
      ...overrides,
    })
    .expect(201);
  return response.body.report;
}

test('report lifecycle follows the approved status transitions', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  await createUser({ email: 'leader@example.test' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const leaderCookies = await signedInCookies(app, 'leader@example.test');

  const created = await createReport(app, leaderCookies);
  assert.equal(created.status, 'new');

  const pastorOpen = await authed(request(app).get(`/api/reports/${created._id}`), pastorCookies).expect(200);
  assert.equal(pastorOpen.body.report.status, 'in_review');

  const pastorRespond = await csrf(request(app).post(`/api/reports/${created._id}/responses`), pastorCookies)
    .send({ message: 'Thank you for trusting us with this. I am praying with you.' })
    .expect(201);
  assert.equal(pastorRespond.body.report.status, 'awaiting_leader');

  const leaderRespond = await csrf(request(app).post(`/api/reports/${created._id}/responses`), leaderCookies)
    .send({ message: 'Thank you pastor, here is a further update.' })
    .expect(201);
  assert.equal(leaderRespond.body.report.status, 'awaiting_pastor');

  const archived = await csrf(request(app).patch(`/api/reports/${created._id}/status`), pastorCookies)
    .send({ status: 'archived' })
    .expect(200);
  assert.equal(archived.body.report.status, 'archived');

  await csrf(request(app).patch(`/api/reports/${created._id}`), leaderCookies)
    .send({ title: 'Trying to edit an archived matter' })
    .expect(409);
  await csrf(request(app).post(`/api/reports/${created._id}/responses`), leaderCookies)
    .send({ message: 'Trying to reply to an archived matter.' })
    .expect(409);

  const reopened = await csrf(request(app).patch(`/api/reports/${created._id}/status`), pastorCookies)
    .send({ status: 'in_review' })
    .expect(200);
  assert.equal(reopened.body.report.status, 'in_review');

  const illegal = await csrf(request(app).patch(`/api/reports/${created._id}/status`), pastorCookies)
    .send({ status: 'awaiting_leader' })
    .expect(409);
  assert.equal(illegal.body.code, 'INVALID_REPORT_TRANSITION');
});

test('leaders are isolated to their own reports while the pastor can access every report', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  await createUser({ email: 'first@example.test', firstName: 'First' });
  await createUser({ email: 'second@example.test', firstName: 'Second' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const firstCookies = await signedInCookies(app, 'first@example.test');
  const secondCookies = await signedInCookies(app, 'second@example.test');

  const created = await createReport(app, firstCookies);
  const hidden = await authed(request(app).get(`/api/reports/${created._id}`), secondCookies).expect(404);
  assert.equal(hidden.body.code, 'REPORT_NOT_FOUND');
  await csrf(request(app).patch(`/api/reports/${created._id}`), secondCookies)
    .send({ title: 'Unauthorized rewrite' })
    .expect(404);
  await csrf(request(app).post(`/api/reports/${created._id}/responses`), secondCookies)
    .send({ message: 'Unauthorized response' })
    .expect(404);

  const secondList = await authed(request(app).get('/api/reports'), secondCookies).expect(200);
  assert.equal(secondList.body.reports.length, 0);
  const pastorList = await authed(request(app).get('/api/reports'), pastorCookies).expect(200);
  assert.deepEqual(pastorList.body.reports.map((report) => report._id), [created._id]);

  await csrf(request(app).patch(`/api/reports/${created._id}`), pastorCookies)
    .send({ title: 'Pastors cannot rewrite the original matter' })
    .expect(403);
});

test('editing a report stores an immutable revision containing only changed fields', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  const leader = await createUser({ email: 'leader@example.test' });
  const leaderCookies = await signedInCookies(app, 'leader@example.test');

  const created = await createReport(app, leaderCookies);
  assert.deepEqual(created.revisions, []);

  const edited = await csrf(request(app).patch(`/api/reports/${created._id}`), leaderCookies)
    .send({ title: 'Corrected subject line', urgency: 'important' })
    .expect(200);

  assert.equal(edited.body.report.revisions.length, 1);
  const [revision] = edited.body.report.revisions;
  assert.equal(revision.revisionNumber, 1);
  assert.equal(String(revision.editor._id), leader.id);
  assert.equal(revision.editor.firstName, 'Ada');
  assert.deepEqual(
    revision.changedFields.map((field) => field.field).sort(),
    ['title', 'urgency'],
  );
  const titleChange = revision.changedFields.find((field) => field.field === 'title');
  assert.equal(titleChange.previousValue, 'Family matter needing prayer');
  assert.equal(titleChange.nextValue, 'Corrected subject line');
  const contentChange = revision.changedFields.find((field) => field.field === 'content');
  assert.equal(contentChange, undefined);

  // Submitting an unchanged value must not create an empty revision.
  await csrf(request(app).patch(`/api/reports/${created._id}`), leaderCookies)
    .send({ title: 'Corrected subject line' })
    .expect(200);
  const unchanged = await Report.findById(created._id);
  assert.equal(unchanged.revisions.length, 1);

  // Clients can never inject or overwrite revisions or responses through an edit.
  await csrf(request(app).patch(`/api/reports/${created._id}`), leaderCookies)
    .send({ revisions: [], responses: [{ message: 'forged' }], status: 'archived' })
    .expect(200);
  const untouched = await Report.findById(created._id);
  assert.equal(untouched.revisions.length, 1);
  assert.equal(untouched.responses.length, 0);
  assert.equal(untouched.status, 'new');

  await assert.rejects(
    Report.updateOne({ _id: created._id }, { $set: { 'revisions.0.changedFields': [] } }),
    /append-only/,
  );
  await assert.rejects(
    Report.updateOne({ _id: created._id }, { $pull: { revisions: { revisionNumber: 1 } } }),
    /append-only/,
  );

  const loaded = await Report.findById(created._id);
  loaded.revisions = [{
    ...loaded.revisions[0].toObject(),
    changedFields: [{ field: 'title', previousValue: 'forged', nextValue: 'history' }],
  }];
  await assert.rejects(loaded.save(), /append-only/);
  await assert.rejects(
    Report.bulkWrite([{ updateOne: { filter: { _id: created._id }, update: { $set: { revisions: [] } } } }]),
    /append-only/,
  );
});

test('responses retain sender/read state and are marked read by the other participant', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  await createUser({ email: 'leader@example.test' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const leaderCookies = await signedInCookies(app, 'leader@example.test');
  const created = await createReport(app, leaderCookies);

  const pastorResponse = await csrf(request(app).post(`/api/reports/${created._id}/responses`), pastorCookies)
    .send({ message: 'I have received this confidential matter.' })
    .expect(201);
  assert.equal(pastorResponse.body.report.responses[0].authorRole, 'pastor');
  assert.equal(pastorResponse.body.report.responses[0].readByPastor, true);
  assert.equal(pastorResponse.body.report.responses[0].readByUser, false);
  assert.equal(pastorResponse.body.report.readState.ownerReadAt, null);

  const leaderRead = await authed(request(app).get(`/api/reports/${created._id}`), leaderCookies).expect(200);
  assert.equal(leaderRead.body.report.responses[0].readByUser, true);
  assert.ok(leaderRead.body.report.readState.ownerReadAt);

  const leaderResponse = await csrf(request(app).post(`/api/reports/${created._id}/responses`), leaderCookies)
    .send({ message: 'Thank you. Here is an update.' })
    .expect(201);
  assert.equal(leaderResponse.body.report.responses[1].authorRole, 'user');
  assert.equal(leaderResponse.body.report.responses[1].readByUser, true);
  assert.equal(leaderResponse.body.report.responses[1].readByPastor, false);
  assert.equal(leaderResponse.body.report.readState.pastorReadAt, null);

  const pastorRead = await authed(request(app).get(`/api/reports/${created._id}`), pastorCookies).expect(200);
  assert.equal(pastorRead.body.report.responses[1].readByPastor, true);
  assert.ok(pastorRead.body.report.responses[0].createdAt);
});

test('archived reports are read-only for both participants until a pastor reopens them', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  await createUser({ email: 'leader@example.test' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const leaderCookies = await signedInCookies(app, 'leader@example.test');

  const created = await createReport(app, leaderCookies);
  await csrf(request(app).patch(`/api/reports/${created._id}/status`), pastorCookies)
    .send({ status: 'archived' })
    .expect(200);

  const archivedResponse = await csrf(request(app).post(`/api/reports/${created._id}/responses`), pastorCookies)
    .send({ message: 'Attempting to reply after archiving.' })
    .expect(409);
  assert.equal(archivedResponse.body.code, 'REPORT_ARCHIVED');

  await authed(request(app).get(`/api/reports/${created._id}`), leaderCookies).expect(200);

  await csrf(request(app).patch(`/api/reports/${created._id}/status`), pastorCookies)
    .send({ status: 'in_review' })
    .expect(200);
  await csrf(request(app).post(`/api/reports/${created._id}/responses`), pastorCookies)
    .send({ message: 'Reopened and replying again.' })
    .expect(201);
});

test('pastor queues sort by priority weight before last activity', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  await createUser({ email: 'leader@example.test' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const leaderCookies = await signedInCookies(app, 'leader@example.test');

  // Created oldest-first by priority so a pure lastActivityAt sort would invert the expected order.
  await createReport(app, leaderCookies, { title: 'Urgent matter', urgency: 'urgent' });
  await createReport(app, leaderCookies, { title: 'Important matter', urgency: 'important' });
  await createReport(app, leaderCookies, { title: 'Normal matter', urgency: 'normal' });

  const list = await authed(request(app).get('/api/reports'), pastorCookies).expect(200);
  assert.deepEqual(
    list.body.reports.map((report) => report.urgency),
    ['urgent', 'important', 'normal'],
  );

  // Leaders see their own matters newest-first, without the pastor triage weighting.
  const leaderList = await authed(request(app).get('/api/reports'), leaderCookies).expect(200);
  assert.deepEqual(
    leaderList.body.reports.map((report) => report.urgency),
    ['normal', 'important', 'urgent'],
  );
});

test('report statistics use the approved status names for each role', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  await createUser({ email: 'leader@example.test' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const leaderCookies = await signedInCookies(app, 'leader@example.test');

  const first = await createReport(app, leaderCookies, { title: 'First matter' });
  await createReport(app, leaderCookies, { title: 'Second matter', sensitivity: 'private' });
  await csrf(request(app).patch(`/api/reports/${first._id}/status`), pastorCookies)
    .send({ status: 'archived' })
    .expect(200);

  const stats = await authed(request(app).get('/api/reports/stats'), pastorCookies).expect(200);
  assert.deepEqual(Object.keys(stats.body.stats).sort(), [
    'archived',
    'awaitingLeader',
    'awaitingPastor',
    'inReview',
    'new',
    'open',
    'private',
    'total',
  ]);
  assert.equal(stats.body.stats.total, 2);
  assert.equal(stats.body.stats.new, 1);
  assert.equal(stats.body.stats.archived, 1);
  assert.equal(stats.body.stats.open, 1);
  assert.equal(stats.body.stats.private, 1);
});

test('report mutations and their audit records commit or roll back together', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  await createUser({ email: 'leader@example.test' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const leaderCookies = await signedInCookies(app, 'leader@example.test');

  const originalRecord = auditService.record;
  let failedAction = 'report.create';
  auditService.record = async (input) => {
    if (input.action === failedAction) throw new Error('simulated report audit failure');
    return originalRecord(input);
  };
  t.after(() => { auditService.record = originalRecord; });

  await csrf(request(app).post('/api/reports'), leaderCookies)
    .send({ title: 'Must roll back', content: 'Creation and audit must be atomic.' })
    .expect(500);
  assert.equal(await Report.countDocuments(), 0);

  failedAction = null;
  const created = await createReport(app, leaderCookies);
  assert.ok(await AuditEvent.exists({ action: 'report.create', targetId: created._id }));

  failedAction = 'report.edit';
  await csrf(request(app).patch(`/api/reports/${created._id}`), leaderCookies)
    .send({ title: 'This edit must roll back' })
    .expect(500);
  let stored = await Report.findById(created._id);
  assert.equal(stored.title, 'Family matter needing prayer');
  assert.equal(stored.revisions.length, 0);

  failedAction = 'report.open';
  await authed(request(app).get(`/api/reports/${created._id}`), pastorCookies).expect(500);
  stored = await Report.findById(created._id);
  assert.equal(stored.status, 'new');
  assert.equal(stored.readState.pastorReadAt, null);

  failedAction = 'report.respond';
  await csrf(request(app).post(`/api/reports/${created._id}/responses`), leaderCookies)
    .send({ message: 'This response must roll back.' })
    .expect(500);
  stored = await Report.findById(created._id);
  assert.equal(stored.status, 'new');
  assert.equal(stored.responses.length, 0);

  failedAction = 'report.transition';
  await csrf(request(app).patch(`/api/reports/${created._id}/status`), pastorCookies)
    .send({ status: 'archived' })
    .expect(500);
  stored = await Report.findById(created._id);
  assert.equal(stored.status, 'new');
});

test('report inputs reject operator-shaped filters, invalid enums, and oversized searches', async (t) => {
  const app = await createTestApp(t);
  await createUser({ email: 'pastor@example.test', role: 'pastor' });
  await createUser({ email: 'leader@example.test' });
  const pastorCookies = await signedInCookies(app, 'pastor@example.test');
  const leaderCookies = await signedInCookies(app, 'leader@example.test');

  const invalidCreate = await csrf(request(app).post('/api/reports'), leaderCookies)
    .send({ title: 'Unsafe input', content: 'Must not accept an operator.', urgency: { $ne: 'normal' } })
    .expect(400);
  assert.equal(invalidCreate.body.code, 'VALIDATION_FAILED');

  const invalidOwner = await authed(request(app).get('/api/reports?owner=not-an-object-id'), pastorCookies).expect(400);
  assert.equal(invalidOwner.body.code, 'VALIDATION_FAILED');
  const oversizedSearch = await authed(
    request(app).get(`/api/reports?search=${encodeURIComponent('x'.repeat(201))}`),
    pastorCookies,
  ).expect(400);
  assert.equal(oversizedSearch.body.code, 'VALIDATION_FAILED');
});
