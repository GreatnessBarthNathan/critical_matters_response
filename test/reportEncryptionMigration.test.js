const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('./helpers/testApp');
const User = require('../src/models/User');
const Report = require('../src/models/Report');
const {
  legacyFieldCount,
  migrateReportEncryption,
  verifyReportEncryption,
} = require('../src/utils/migrateReportEncryption');
const { isEncryptedReportValue, decryptReportValue } = require('../src/utils/reportEncryption');

test('report encryption migration is dry-run safe, idempotent, and covers replies and revisions', async (t) => {
  await createTestApp(t);
  const owner = await User.create({
    firstName: 'Legacy', lastName: 'Leader', email: 'legacy-encryption@example.test', password: 'correct horse battery staple',
  });
  await Report.create({
    owner: owner.id,
    reference: 'CMR-LEGACY-001',
    title: 'Legacy private title',
    content: 'Legacy private content',
    responses: [{ author: owner.id, authorRole: 'user', message: 'Legacy reply' }],
    revisions: [{
      revisionNumber: 1,
      editor: owner.id,
      changedFields: [{ field: 'title', previousValue: 'Old title', nextValue: 'Legacy private title' }],
    }],
  });

  const dryRun = await migrateReportEncryption({ dryRun: true });
  assert.equal(dryRun.reportsScanned, 1);
  assert.equal(dryRun.reportsChanged, 0);
  assert.equal(dryRun.fieldsConverted, 5);
  const before = await Report.findOne({ reference: 'CMR-LEGACY-001' }).lean();
  assert.equal(before.title, 'Legacy private title');

  const migrated = await migrateReportEncryption();
  assert.equal(migrated.reportsChanged, 1);
  assert.equal(migrated.fieldsConverted, 5);
  const stored = await Report.findOne({ reference: 'CMR-LEGACY-001' }).lean();
  assert.equal(isEncryptedReportValue(stored.title), true);
  assert.equal(decryptReportValue(stored.title), 'Legacy private title');
  assert.equal(decryptReportValue(stored.responses[0].message), 'Legacy reply');
  assert.equal(decryptReportValue(stored.revisions[0].changedFields[0].previousValue), 'Old title');

  const rerun = await migrateReportEncryption();
  assert.equal(rerun.reportsChanged, 0);
  assert.equal(rerun.fieldsConverted, 0);
  const verification = await verifyReportEncryption();
  assert.equal(verification.invalidFields, 0);
  assert.equal(verification.encryptedFields, 5);
  assert.equal(legacyFieldCount(stored), 0);
});
