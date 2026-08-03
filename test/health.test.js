const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../app');

test('GET /api/health returns the service status', async () => {
  const app = createApp();

  const response = await request(app).get('/api/health').expect(200);

  assert.deepEqual(response.body, {
    status: 'ok',
    service: 'Critical Matters Response',
  });
});
