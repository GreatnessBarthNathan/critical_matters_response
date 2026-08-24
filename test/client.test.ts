const test = require('node:test');
const assert = require('node:assert/strict');

test('frontend retries only stable CSRF_INVALID errors', async () => {
  const { isCsrfInvalidError } = await import('../frontend/src/api/client.ts');

  assert.equal(isCsrfInvalidError({ code: 'CSRF_INVALID' }), true);
  assert.equal(isCsrfInvalidError({ error: { code: 'CSRF_INVALID' } }), true);
  assert.equal(isCsrfInvalidError({ code: 'FORBIDDEN' }), false);
  assert.equal(isCsrfInvalidError({ message: 'A valid CSRF token is required.' }), false);
  assert.equal(isCsrfInvalidError(null), false);
});
