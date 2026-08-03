const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('./helpers/testApp');
const AuditEvent = require('../src/models/AuditEvent');
const auditService = require('../src/services/auditService');

test('audit metadata permits only safe fields and strips sensitive input', async (t) => {
  await createTestApp(t);

  await auditService.record({
    action: 'report.view',
    targetType: 'report',
    targetId: 'report-123',
    result: 'success',
    metadata: {
      ip: '127.0.0.1',
      userAgent: 'CMR test',
      requestId: 'request-123',
      reason: 'viewed assigned report',
      changedFields: ['status', 'title', 'password', 'content'],
      title: 'private report title',
      content: 'private report body',
      password: 'not-a-password',
      token: 'not-a-token',
      cookie: 'not-a-cookie',
      recoveryCode: 'not-a-code',
      totp: 'not-a-totp',
      nested: { response: 'confidential', token: 'nested-token' },
    },
  });

  const event = await AuditEvent.findOne().lean();
  assert.deepEqual({
    ...event.metadata,
    userAgent: event.metadata.userAgent?.replace(/[0-9a-f]+$/, '<hash>'),
  }, {
    ip: '127.0.0.1',
    userAgent: 'sha256:<hash>',
    requestId: 'request-123',
    reason: 'viewed assigned report',
    changedFields: ['status'],
  });
  assert.match(event.metadata.userAgent, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(event), /CMR test|not-a-token/);
});

test('AuditEvent documents cannot be changed or deleted after creation', async (t) => {
  await createTestApp(t);
  const event = await auditService.record({
    action: 'auth.login',
    targetType: 'user',
    targetId: 'user-123',
    result: 'success',
  });

  event.action = 'auth.logout';
  await assert.rejects(event.save(), /append-only/i);
  await assert.rejects(AuditEvent.updateOne({ _id: event.id }, { action: 'auth.logout' }), /append-only/i);
  await assert.rejects(AuditEvent.deleteOne({ _id: event.id }), /append-only/i);
});

test('AuditEvent bulk writes fail closed and changed fields are capped', async (t) => {
  await createTestApp(t);
  const changedFields = Array.from({ length: 55 }, (_value, index) => `field-${index}`);
  const event = await auditService.record({
    action: 'report.update',
    targetType: 'report',
    targetId: 'report-456',
    result: 'success',
    metadata: { changedFields },
  });

  assert.equal(event.metadata.changedFields.length, 50);
  await assert.rejects(
    AuditEvent.bulkWrite([
      { updateOne: { filter: { _id: event.id }, update: { action: 'report.delete' } } },
      { deleteOne: { filter: { _id: event.id } } },
    ]),
    /append-only/i,
  );
  const unchangedEvent = await AuditEvent.findById(event.id).lean();
  assert.equal(unchangedEvent.action, 'report.update');

  await assert.rejects(
    AuditEvent.create({
      action: 'report.update',
      targetType: 'report',
      targetId: 'report-789',
      result: 'success',
      metadata: { changedFields: Array.from({ length: 51 }, (_value, index) => `field-${index}`) },
    }),
    /at most 50/i,
  );
});
