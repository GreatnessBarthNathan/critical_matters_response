const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../app');

test('production serves SPA routes while unknown API routes return JSON 404 responses', async (t) => {
  const frontendDist = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-matters-response-'));
  const previousNodeEnv = process.env.NODE_ENV;
  fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><title>Critical Matters Response</title>');
  process.env.NODE_ENV = 'production';
  t.after(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    fs.rmSync(frontendDist, { recursive: true, force: true });
  });

  const app = createApp({ frontendDist });
  const spaResponse = await request(app).get('/login').expect(200);
  const apiResponse = await request(app).get('/api/not-a-route').expect(404);

  assert.equal(spaResponse.text, '<!doctype html><title>Critical Matters Response</title>');
  assert.deepEqual(Object.keys(apiResponse.body), ['error']);
  assert.equal(apiResponse.body.error.code, 'NOT_FOUND');
  assert.equal(apiResponse.body.error.message, 'Route not found: GET /api/not-a-route');
  assert.equal(apiResponse.body.error.stack, undefined);
});
