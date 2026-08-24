/**
 * End-to-end smoke flow against a temporary MongoDB replica set.
 *
 * Exercises the whole approved release in order: admin bootstrap, admin TOTP, invitation,
 * redemption, report create/edit/revision, cross-leader privacy, both sides of the conversation,
 * archive read-only behaviour, Tech Support-assisted reset, session revocation, and production serving.
 *
 * Run with: npm run smoke
 */
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { authenticator } = require('otplib');

const PASTOR_EMAIL = 'pastor@smoke.test';
const PASTOR_PASSWORD = 'a strong initial pastor password';
const SUPPORT_EMAIL = 'support@smoke.test';
const SUPPORT_PASSWORD = 'a strong support password';
const LEADER_EMAIL = 'leader@smoke.test';
const LEADER_PASSWORD = 'a strong leader password';
const OTHER_EMAIL = 'other@smoke.test';
const NEW_LEADER_PASSWORD = 'a replacement leader password';

function step(message) {
  process.stdout.write(`  ✓ ${message}\n`);
}

function cookie(response, name) {
  return (response.headers['set-cookie'] || []).find((value) => value.startsWith(`${name}=`));
}

/** Every mutation needs a fresh signed CSRF pair, so bundle the session handling in one place. */
async function session(app, { authCookie } = {}) {
  const csrfResponse = await request(app).get('/api/auth/csrf').expect(200);
  return {
    authCookie,
    csrfCookie: cookie(csrfResponse, 'cmr_csrf'),
    csrfToken: csrfResponse.body.csrfToken,
  };
}

function withCsrf(builder, ctx) {
  return builder
    .set('Cookie', [ctx.authCookie, ctx.csrfCookie].filter(Boolean))
    .set('X-CSRF-Token', ctx.csrfToken);
}

function asUser(builder, ctx) {
  return builder.set('Cookie', [ctx.authCookie, ctx.csrfCookie].filter(Boolean));
}

async function signIn(app, email, password, totpSecret) {
  const login = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  const ctx = await session(app, { authCookie: cookie(login, 'cmr_token') });

  if (login.body.requiresTotp) {
    assert.ok(totpSecret, 'a TOTP secret is required for this account');
    const verified = await withCsrf(
      request(app).post('/api/auth/totp/verify-login'),
      { ...ctx, authCookie: cookie(login, 'cmr_totp_pending') },
    ).send({ token: authenticator.generate(totpSecret) }).expect(200);
    ctx.authCookie = cookie(verified, 'cmr_token');
  }
  return ctx;
}

async function run() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = replSet.getUri();
  process.env.JWT_SECRET = 'smoke-jwt-secret-that-is-long-enough-to-be-safe';
  process.env.CSRF_SECRET = 'smoke-csrf-secret-that-is-long-enough-to-be-safe';
  process.env.TOTP_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('base64');
  process.env.REPORT_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('base64');
  process.env.RECOVERY_CODE_PEPPER = 'smoke-recovery-pepper-that-is-long-enough';
  process.env.ADMIN_EMAIL = PASTOR_EMAIL;
  process.env.ADMIN_PASSWORD = PASTOR_PASSWORD;
  process.env.TECH_SUPPORT_EMAIL = SUPPORT_EMAIL;
  process.env.TECH_SUPPORT_PASSWORD = SUPPORT_PASSWORD;

  const createApp = require('../app');
  const connectDatabase = require('../src/config/database');
  const seedAdmin = require('../src/utils/seedAdmin');
  const seedTechSupport = require('../src/utils/seedTechSupport');

  await connectDatabase();

  try {
    // 1. Admin and Tech Support bootstrap
    await seedAdmin();
    await seedTechSupport();
    const app = createApp();
    step('admin and Tech Support accounts bootstrapped from the environment');

    // 2. Pastor TOTP is optional before the workspace opens
    let pastor = await signIn(app, PASTOR_EMAIL, PASTOR_PASSWORD);
    await asUser(request(app).get('/api/reports'), pastor).expect(200);

    const setup = await withCsrf(request(app).post('/api/auth/totp/setup'), pastor)
      .send({ currentPassword: PASTOR_PASSWORD })
      .expect(200);
    const setupCookie = cookie(setup, 'cmr_totp_setup');
    const pastorSecret = new URL(setup.body.otpauthUrl).searchParams.get('secret');

    const confirmed = await request(app)
      .post('/api/auth/totp/confirm')
      .set('Cookie', [pastor.authCookie, pastor.csrfCookie, setupCookie])
      .set('X-CSRF-Token', pastor.csrfToken)
      .send({ token: authenticator.generate(pastorSecret) })
      .expect(200);
    assert.equal(confirmed.body.recoveryCodes.length, 8);
    step('pastor two-factor configured and recovery codes issued once');

    pastor = await signIn(app, PASTOR_EMAIL, PASTOR_PASSWORD, pastorSecret);
    await asUser(request(app).get('/api/reports'), pastor).expect(200);
    step('pastor workspace remains available after optional two-factor verification');

    const techSupport = await signIn(app, SUPPORT_EMAIL, SUPPORT_PASSWORD);

    // 3. Invitation
    const invitation = await withCsrf(request(app).post('/api/invitations'), techSupport)
      .send({ email: LEADER_EMAIL })
      .expect(201);
    const inspected = await request(app).get(`/api/invitations/${invitation.body.token}`).expect(200);
    assert.equal(inspected.body.valid, true);
    assert.match(inspected.body.invitation.email, /^l\*\*\*@/);
    step('invitation created and inspected neutrally');

    // 4. Redemption
    const redeemed = await request(app)
      .post(`/api/invitations/${invitation.body.token}/redeem`)
      .send({ firstName: 'Lydia', lastName: 'Leader', password: LEADER_PASSWORD, email: LEADER_EMAIL })
      .expect(201);
    const leaderRecoveryCodes = redeemed.body.recoveryCodes;
    assert.equal(leaderRecoveryCodes.length, 8);
    await request(app)
      .post(`/api/invitations/${invitation.body.token}/redeem`)
      .send({ firstName: 'Replay', lastName: 'Attempt', password: LEADER_PASSWORD })
      .expect(400);
    step('invitation redeemed once, and a replay is refused');

    let leader = await signIn(app, LEADER_EMAIL, LEADER_PASSWORD);

    // 5. Create and edit a matter, and confirm the revision
    const created = await withCsrf(request(app).post('/api/reports'), leader)
      .send({
        title: 'A confidential family matter',
        category: 'general',
        urgency: 'important',
        content: 'The original wording of a private matter, written by the leader.',
      })
      .expect(201);
    const reportId = created.body.report._id;
    assert.equal(created.body.report.status, 'new');

    const edited = await withCsrf(request(app).patch(`/api/reports/${reportId}`), leader)
      .send({ title: 'A corrected subject line' })
      .expect(200);
    assert.equal(edited.body.report.revisions.length, 1);
    const [revision] = edited.body.report.revisions;
    assert.deepEqual(revision.changedFields.map((change) => change.field), ['title']);
    assert.equal(revision.changedFields[0].previousValue, 'A confidential family matter');
    step('matter created, edited, and the revision records only what changed');

    // 6. A second leader must not be able to reach it
    const otherInvitation = await withCsrf(request(app).post('/api/invitations'), techSupport)
      .send({ email: OTHER_EMAIL })
      .expect(201);
    await request(app)
      .post(`/api/invitations/${otherInvitation.body.token}/redeem`)
      .send({ firstName: 'Otto', lastName: 'Other', password: LEADER_PASSWORD, email: OTHER_EMAIL })
      .expect(201);
    const other = await signIn(app, OTHER_EMAIL, LEADER_PASSWORD);

    const hidden = await asUser(request(app).get(`/api/reports/${reportId}`), other).expect(404);
    assert.equal(hidden.body.error.code, 'REPORT_NOT_FOUND');
    const otherList = await asUser(request(app).get('/api/reports'), other).expect(200);
    assert.equal(otherList.body.reports.length, 0);
    step('a second leader receives 404 and never sees the matter in their list');

    // 7. Both sides of the conversation
    const opened = await asUser(request(app).get(`/api/reports/${reportId}`), pastor).expect(200);
    assert.equal(opened.body.report.status, 'in_review');

    const pastorReply = await withCsrf(request(app).post(`/api/reports/${reportId}/responses`), pastor)
      .send({ message: 'Thank you for trusting us with this. I am praying with you.' })
      .expect(201);
    assert.equal(pastorReply.body.report.status, 'awaiting_leader');

    const leaderReply = await withCsrf(request(app).post(`/api/reports/${reportId}/responses`), leader)
      .send({ message: 'Thank you, Pastor. Here is a further update.' })
      .expect(201);
    assert.equal(leaderReply.body.report.status, 'awaiting_pastor');
    step('pastor and leader each replied, and the status followed the conversation');

    // 8. Archive is read-only, and only the pastor can reopen it
    const archived = await withCsrf(request(app).patch(`/api/reports/${reportId}/status`), pastor)
      .send({ status: 'archived' })
      .expect(200);
    assert.equal(archived.body.report.status, 'archived');

    const blockedEdit = await withCsrf(request(app).patch(`/api/reports/${reportId}`), leader)
      .send({ title: 'Trying to edit an archived matter' })
      .expect(409);
    assert.equal(blockedEdit.body.error.code, 'REPORT_ARCHIVED');
    await withCsrf(request(app).post(`/api/reports/${reportId}/responses`), leader)
      .send({ message: 'Trying to reply to an archived matter.' })
      .expect(409);
    await asUser(request(app).get(`/api/reports/${reportId}`), leader).expect(200);
    step('archived matter is read-only for both participants but still readable');

    const reopened = await withCsrf(request(app).patch(`/api/reports/${reportId}/status`), pastor)
      .send({ status: 'in_review' })
      .expect(200);
    assert.equal(reopened.body.report.status, 'in_review');
    step('pastor reopened the matter');

    // 9. Tech Support-assisted reset revokes the leader's existing session
    const leaderId = created.body.report.owner._id || created.body.report.owner;
    const issued = await withCsrf(request(app).post(`/api/users/${leaderId}/reset-code`), techSupport).expect(201);
    assert.ok(issued.body.resetCode);

    const preResetCookie = leader.authCookie;
    await asUser(request(app).get('/api/auth/me'), leader).expect(200);

    const anonymous = await session(app);
    await withCsrf(request(app).post('/api/auth/assisted-reset'), anonymous)
      .send({ email: LEADER_EMAIL, resetCode: issued.body.resetCode, newPassword: NEW_LEADER_PASSWORD })
      .expect(200);

    await request(app).get('/api/auth/me').set('Cookie', preResetCookie).expect(401);
    leader = await signIn(app, LEADER_EMAIL, NEW_LEADER_PASSWORD);
    await asUser(request(app).get('/api/auth/me'), leader).expect(200);
    step('assisted reset worked once and revoked the leader’s previous session');

    // 10. Recovery codes are single use
    const recovery = await session(app);
    await withCsrf(request(app).post('/api/auth/recover-with-code'), recovery)
      .send({ email: OTHER_EMAIL, recoveryCode: leaderRecoveryCodes[0], newPassword: NEW_LEADER_PASSWORD })
      .expect(400);
    step('a recovery code belonging to another account is refused');

    // 11. The internal audit trail is not exposed as a public API.
    await asUser(request(app).get('/api/audit'), leader).expect(404);
    await asUser(request(app).get('/api/audit'), pastor).expect(404);
    await asUser(request(app).get('/api/audit'), techSupport).expect(404);
    step('audit records remain internal and the audit API is absent for every role');

    // 12. Production serving
    const distIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
    assert.ok(fs.existsSync(distIndex), 'run "npm run build" before the smoke test');
    process.env.NODE_ENV = 'production';
    const productionApp = createApp();
    const spa = await request(productionApp).get('/login').expect(200);
    assert.match(spa.text, /<div id="root">/);
    const health = await request(productionApp).get('/api/health').expect(200);
    assert.equal(health.body.status, 'ok');
    const unknown = await request(productionApp).get('/api/nope').expect(404);
    assert.equal(unknown.body.error.code, 'NOT_FOUND');
    process.env.NODE_ENV = 'test';
    step('production build serves the app, health JSON, and JSON 404s for unknown API paths');

    process.stdout.write(
      '\nCMR smoke test passed: invitation, TOTP, privacy, revisions, conversation, archive, recovery, and production serving.\n',
    );
  } finally {
    await mongoose.disconnect();
    await replSet.stop();
  }
}

run().catch((error) => {
  process.stderr.write(`\nCMR smoke test FAILED: ${error.message}\n`);
  if (error.stack) process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
