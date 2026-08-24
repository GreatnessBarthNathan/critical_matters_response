const test = require('node:test');
const assert = require('node:assert/strict');
const { setAuthCookie } = require('../src/utils/authToken');

function cookieOptionsFor(expiry) {
  const previousExpiry = process.env.JWT_EXPIRES_IN;
  if (expiry === undefined) delete process.env.JWT_EXPIRES_IN;
  else process.env.JWT_EXPIRES_IN = expiry;
  const captured = {};
  setAuthCookie({ cookie: (_name, _value, options) => Object.assign(captured, options) }, 'token');
  if (previousExpiry === undefined) delete process.env.JWT_EXPIRES_IN;
  else process.env.JWT_EXPIRES_IN = previousExpiry;
  return captured;
}

test('auth cookie lifetime follows supported JWT expiry values', () => {
  assert.equal(cookieOptionsFor('1h').maxAge, 60 * 60 * 1000);
  assert.equal(cookieOptionsFor('7d').maxAge, 7 * 24 * 60 * 60 * 1000);
  assert.equal(cookieOptionsFor('not-supported').maxAge, 7 * 24 * 60 * 60 * 1000);
});
