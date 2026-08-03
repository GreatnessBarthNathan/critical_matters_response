const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const User = require('../src/models/User');

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

test('future public invitation inspection and redemption shapes are exempt while administration remains protected', async (t) => {
  const app = await createTestApp(t);

  await request(app).get('/api/invitations/invitation-token').expect(404);
  await request(app).post('/api/invitations/invitation-token/redeem').send({}).expect(404);
  await request(app).post('/api/invitations').send({}).expect(403);
});
