const test = require('node:test');
const assert = require('node:assert/strict');
const { getConfig } = require('../src/config/env');
const createApp = require('../app');

const validProductionEnv = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://localhost/critical-matters-response',
  JWT_SECRET: 'j'.repeat(32),
  CSRF_SECRET: 'c'.repeat(32),
  TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  RECOVERY_CODE_PEPPER: 'r'.repeat(32),
};

test('getConfig reports all missing production values together', () => {
  assert.throws(
    () => getConfig({ NODE_ENV: 'production' }),
    /Missing required environment values: MONGODB_URI, JWT_SECRET, CSRF_SECRET, TOTP_ENCRYPTION_KEY, RECOVERY_CODE_PEPPER/,
  );
});

test('getConfig rejects weak and placeholder production secrets', () => {
  assert.throws(
    () => getConfig({ ...validProductionEnv, JWT_SECRET: 'too-short' }),
    /JWT_SECRET must be at least 32 bytes/,
  );
  assert.throws(
    () => getConfig({ ...validProductionEnv, JWT_SECRET: 'replace-with-a-long-random-secret-at-least-32-characters' }),
    /JWT_SECRET must be at least 32 bytes and not use a placeholder value/,
  );
  assert.throws(
    () => getConfig({ ...validProductionEnv, CSRF_SECRET: 'replace-with-a-long-random-secret' }),
    /CSRF_SECRET must be at least 32 bytes and not use a placeholder value/,
  );
  assert.throws(
    () => getConfig({ ...validProductionEnv, RECOVERY_CODE_PEPPER: 'too-short' }),
    /RECOVERY_CODE_PEPPER must be at least 32 bytes/,
  );
  assert.throws(
    () => getConfig({ ...validProductionEnv, RECOVERY_CODE_PREVIOUS_PEPPERS: 'short,still-short' }),
    /RECOVERY_CODE_PREVIOUS_PEPPERS entry must be at least 32 bytes/,
  );
});

test('getConfig rejects malformed, noncanonical, and incorrectly sized TOTP keys', () => {
  assert.throws(
    () => getConfig({ ...validProductionEnv, TOTP_ENCRYPTION_KEY: 'not valid base64!' }),
    /strict canonical Base64/,
  );
  assert.throws(
    () => getConfig({ ...validProductionEnv, TOTP_ENCRYPTION_KEY: validProductionEnv.TOTP_ENCRYPTION_KEY.slice(0, -1) }),
    /strict canonical Base64/,
  );
  assert.throws(
    () => getConfig({ ...validProductionEnv, TOTP_ENCRYPTION_KEY: Buffer.alloc(31, 1).toString('base64') }),
    /exactly 32 bytes/,
  );
});

test('getConfig rejects invalid ports', () => {
  for (const port of ['0', '65536', 'not-a-port', '5000.5']) {
    assert.throws(
      () => getConfig({ ...validProductionEnv, PORT: port }),
      /PORT must be an integer between 1 and 65535/,
    );
  }
});

test('getConfig validates TRUST_PROXY_HOPS and defaults it to no trusted proxy', () => {
  assert.equal(getConfig(validProductionEnv).trustProxyHops, 0);
  assert.equal(getConfig({ ...validProductionEnv, TRUST_PROXY_HOPS: '1' }).trustProxyHops, 1);
  for (const hops of ['-1', '1.5', 'true', '100']) {
    assert.throws(() => getConfig({ ...validProductionEnv, TRUST_PROXY_HOPS: hops }), /TRUST_PROXY_HOPS/);
  }
});

test('app defaults to direct connections and does not trust X-Forwarded-For', () => {
  const directApp = createApp();
  assert.equal(directApp.get('trust proxy'), false);
  assert.equal(directApp.get('trust proxy fn')('203.0.113.10', 0), false);
  assert.equal(createApp({ trustProxyHops: 1 }).get('trust proxy fn')('203.0.113.10', 0), true);
});

test('getConfig returns valid production config', () => {
  assert.deepEqual(getConfig({ ...validProductionEnv, PORT: '8443' }), {
    production: true,
    port: 8443,
    mongodbUri: 'mongodb://localhost/critical-matters-response',
    trustProxyHops: 0,
  });
});
