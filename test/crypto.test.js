const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptSecret, decryptSecret } = require('../src/utils/crypto');

function setEncryptionKey(t) {
  const previousKey = process.env.TOTP_ENCRYPTION_KEY;
  process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  t.after(() => {
    if (previousKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = previousKey;
  });
}

test('AES-GCM encryption round-trips secrets with fresh IVs and rejects tampering', (t) => {
  setEncryptionKey(t);
  const first = encryptSecret('totp-secret');
  const second = encryptSecret('totp-secret');

  assert.notEqual(first, second);
  assert.equal(decryptSecret(first), 'totp-secret');
  const parts = first.split('.');
  const ciphertext = Buffer.from(parts[2], 'base64url');
  ciphertext[0] ^= 1;
  parts[2] = ciphertext.toString('base64url');
  assert.throws(() => decryptSecret(parts.join('.')), /Unable to decrypt secret/);
});
