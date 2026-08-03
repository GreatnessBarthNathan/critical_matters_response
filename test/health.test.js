const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../app');

const BUILT_INDEX = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');

test('GET /api/health returns the service status', async () => {
  const app = createApp();

  const response = await request(app).get('/api/health').expect(200);

  assert.deepEqual(response.body, {
    status: 'ok',
    service: 'Critical Matters Response',
  });
});

test('the production build serves the real compiled frontend for browser routes', async (t) => {
  if (!fs.existsSync(BUILT_INDEX)) {
    // The build is a separate step; skip rather than assert against a missing artifact.
    t.skip('frontend/dist/index.html is missing — run "npm run build" first');
    return;
  }

  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  const app = createApp();

  const login = await request(app).get('/login').expect(200);
  assert.match(login.headers['content-type'], /text\/html/);
  // The served document is the built one, referencing generated asset bundles.
  assert.match(login.text, /<div id="root">/);
  assert.match(login.text, /\/assets\/index-[A-Za-z0-9_-]+\.js/);
  assert.match(login.text, /\/assets\/index-[A-Za-z0-9_-]+\.css/);

  // A deep client route resolves to the same document, not a 404.
  const deepRoute = await request(app).get('/invite/some-token').expect(200);
  assert.equal(deepRoute.text, login.text);

  const health = await request(app).get('/api/health').expect(200);
  assert.match(health.headers['content-type'], /application\/json/);
  assert.equal(health.body.status, 'ok');

  const unknownApi = await request(app).get('/api/nope').expect(404);
  assert.match(unknownApi.headers['content-type'], /application\/json/);
  assert.equal(unknownApi.body.error.code, 'NOT_FOUND');
});
