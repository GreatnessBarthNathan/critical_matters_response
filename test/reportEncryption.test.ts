const test = require('node:test');
const assert = require('node:assert/strict');
const {
  encryptReportValue,
  decryptReportValue,
  decryptLegacyOrEncryptedValue,
  isEncryptedReportValue,
} = require('../src/utils/reportEncryption');

test('report AES-GCM envelopes round-trip with fresh IVs', (t) => {
  const previous = process.env.REPORT_ENCRYPTION_KEY;
  process.env.REPORT_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString('base64');
  t.after(() => {
    if (previous === undefined) delete process.env.REPORT_ENCRYPTION_KEY;
    else process.env.REPORT_ENCRYPTION_KEY = previous;
  });

  const first = encryptReportValue('private report body');
  const second = encryptReportValue('private report body');
  assert.notEqual(first, second);
  assert.equal(isEncryptedReportValue(first), true);
  assert.equal(decryptReportValue(first), 'private report body');
  assert.equal(decryptLegacyOrEncryptedValue('legacy body'), 'legacy body');
});

test('report envelopes reject tampering and use the previous key during rotation', (t) => {
  const previousCurrent = process.env.REPORT_ENCRYPTION_KEY;
  const previousPrevious = process.env.REPORT_ENCRYPTION_PREVIOUS_KEY;
  const oldKey = Buffer.alloc(32, 5).toString('base64');
  const newKey = Buffer.alloc(32, 6).toString('base64');
  process.env.REPORT_ENCRYPTION_KEY = oldKey;
  const oldValue = encryptReportValue('old content');
  process.env.REPORT_ENCRYPTION_KEY = newKey;
  process.env.REPORT_ENCRYPTION_PREVIOUS_KEY = oldKey;
  assert.equal(decryptReportValue(oldValue.replace('.current.', '.previous.')), 'old content');
  const parts = oldValue.split('.');
  const data = Buffer.from(parts[4], 'base64url');
  data[0] ^= 1;
  parts[4] = data.toString('base64url');
  assert.throws(() => decryptReportValue(parts.join('.')), /Unable to decrypt report value/);
  t.after(() => {
    if (previousCurrent === undefined) delete process.env.REPORT_ENCRYPTION_KEY;
    else process.env.REPORT_ENCRYPTION_KEY = previousCurrent;
    if (previousPrevious === undefined) delete process.env.REPORT_ENCRYPTION_PREVIOUS_KEY;
    else process.env.REPORT_ENCRYPTION_PREVIOUS_KEY = previousPrevious;
  });
});
