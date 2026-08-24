const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('./helpers/testApp');
const User = require('../src/models/User');
const Report = require('../src/models/Report');
const { encryptReportValue, decryptReportValue } = require('../src/utils/reportEncryption');
const { rotateReportEncryption } = require('../src/utils/migrateReportEncryption');

test('report encryption rotation rewrites old key ids and is idempotent', async (t) => {
  await createTestApp(t);
  const previousKey = process.env.REPORT_ENCRYPTION_KEY;
  const previousKeyId = process.env.REPORT_ENCRYPTION_KEY_ID;
  const previousPreviousKey = process.env.REPORT_ENCRYPTION_PREVIOUS_KEY;
  const previousPreviousKeyId = process.env.REPORT_ENCRYPTION_PREVIOUS_KEY_ID;
  const oldKey = Buffer.alloc(32, 21).toString('base64');
  const newKey = Buffer.alloc(32, 22).toString('base64');
  process.env.REPORT_ENCRYPTION_KEY = oldKey;
  process.env.REPORT_ENCRYPTION_KEY_ID = 'old';
  const owner = await User.create({ firstName: 'Rotate', lastName: 'Owner', email: 'rotate@example.test', password: 'correct horse battery staple' });
  await Report.create({ owner: owner.id, reference: 'CMR-ROTATE-001', title: encryptReportValue('Old title'), content: encryptReportValue('Old body') });

  process.env.REPORT_ENCRYPTION_KEY = newKey;
  process.env.REPORT_ENCRYPTION_KEY_ID = 'new';
  process.env.REPORT_ENCRYPTION_PREVIOUS_KEY = oldKey;
  process.env.REPORT_ENCRYPTION_PREVIOUS_KEY_ID = 'old';
  assert.equal(decryptReportValue((await Report.findOne({ reference: 'CMR-ROTATE-001' })).title), 'Old title');

  const rotated = await rotateReportEncryption();
  assert.equal(rotated.reportsChanged, 1);
  assert.equal(rotated.fieldsRotated, 2);
  const stored = await Report.findOne({ reference: 'CMR-ROTATE-001' }).lean();
  assert.equal(stored.title.split('.')[1], 'new');
  assert.equal(decryptReportValue(stored.title), 'Old title');
  assert.deepEqual(await rotateReportEncryption(), { reportsScanned: 1, reportsChanged: 0, fieldsRotated: 0 });

  t.after(() => {
    if (previousKey === undefined) delete process.env.REPORT_ENCRYPTION_KEY;
    else process.env.REPORT_ENCRYPTION_KEY = previousKey;
    if (previousKeyId === undefined) delete process.env.REPORT_ENCRYPTION_KEY_ID;
    else process.env.REPORT_ENCRYPTION_KEY_ID = previousKeyId;
    if (previousPreviousKey === undefined) delete process.env.REPORT_ENCRYPTION_PREVIOUS_KEY;
    else process.env.REPORT_ENCRYPTION_PREVIOUS_KEY = previousPreviousKey;
    if (previousPreviousKeyId === undefined) delete process.env.REPORT_ENCRYPTION_PREVIOUS_KEY_ID;
    else process.env.REPORT_ENCRYPTION_PREVIOUS_KEY_ID = previousPreviousKeyId;
  });
});
