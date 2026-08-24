const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { createTestApp } = require('./helpers/testApp');
const User = require('../src/models/User');
const Report = require('../src/models/Report');
const AuditEvent = require('../src/models/AuditEvent');
const { migrateRolesAndCategories } = require('../src/utils/migrateRolesAndCategories');

test('role and category migration converts legacy records without touching current values', async (t) => {
  await createTestApp(t);
  const legacyUserId = new mongoose.Types.ObjectId();
  const currentUserId = new mongoose.Types.ObjectId();
  const now = new Date();

  await User.collection.insertMany([
    { _id: legacyUserId, firstName: 'Legacy', lastName: 'Pastor', email: 'legacy-admin@example.test', password: 'hash', role: 'pastor', isActive: true, createdAt: now, updatedAt: now },
    { _id: currentUserId, firstName: 'Current', lastName: 'Admin', email: 'current-admin@example.test', password: 'hash', role: 'admin', isActive: true, createdAt: now, updatedAt: now },
  ]);
  await Report.collection.insertMany([
    {
      owner: legacyUserId,
      reference: 'CMR-MIGRATE-PRIVATE',
      title: 'Legacy private matter',
      content: 'Private legacy content',
      category: 'family',
      sensitivity: 'private',
      urgency: 'normal',
      priorityWeight: 0,
      status: 'new',
      responses: [{ author: legacyUserId, authorRole: 'pastor', message: 'A response', readByUser: false, readByPastor: true, createdAt: now, updatedAt: now }],
      revisions: [],
      readState: { ownerReadAt: now, pastorReadAt: now },
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      owner: legacyUserId,
      reference: 'CMR-MIGRATE-STANDARD',
      title: 'Legacy standard matter',
      content: 'Standard legacy content',
      category: 'health',
      sensitivity: 'standard',
      urgency: 'normal',
      priorityWeight: 0,
      status: 'new',
      responses: [],
      revisions: [],
      readState: { ownerReadAt: now, pastorReadAt: null },
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await AuditEvent.collection.insertOne({
    actor: legacyUserId,
    actorRole: 'pastor',
    action: 'legacy.action',
    targetType: 'report',
    targetId: 'CMR-MIGRATE-PRIVATE',
    result: 'success',
    metadata: {},
    createdAt: now,
    updatedAt: now,
  });

  const result = await migrateRolesAndCategories();
  assert.deepEqual(result, { users: 1, auditEvents: 1, responseRoles: 1, sensitiveCategories: 1, generalCategories: 1 });
  assert.equal((await User.collection.findOne({ _id: legacyUserId })).role, 'admin');
  assert.equal((await User.collection.findOne({ _id: currentUserId })).role, 'admin');
  assert.equal((await Report.collection.findOne({ reference: 'CMR-MIGRATE-PRIVATE' })).category, 'sensitive');
  assert.equal((await Report.collection.findOne({ reference: 'CMR-MIGRATE-PRIVATE' })).responses[0].authorRole, 'admin');
  assert.equal((await Report.collection.findOne({ reference: 'CMR-MIGRATE-STANDARD' })).category, 'general');
  assert.equal((await AuditEvent.collection.findOne({ action: 'legacy.action' })).actorRole, 'admin');
  assert.deepEqual(await migrateRolesAndCategories(), {
    users: 0, auditEvents: 0, responseRoles: 0, sensitiveCategories: 0, generalCategories: 0,
  });
});
