const AuditEvent = require('../models/AuditEvent');

const SAFE_METADATA_KEYS = new Set(['ip', 'userAgent', 'requestId', 'reason', 'changedFields']);
const SENSITIVE_FIELD = /(?:title|content|body|response|pass(?:word)?|secret|token|cookie|recovery|totp)/i;
const FIELD_LIMITS = {
  ip: 100,
  userAgent: 500,
  requestId: 100,
  reason: 500,
};

function safeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const metadata = {};

  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (key === 'changedFields') {
      if (Array.isArray(value)) {
        const changedFields = value
          .filter((field) => typeof field === 'string' && !SENSITIVE_FIELD.test(field))
          .slice(0, 50)
          .map((field) => field.slice(0, 100));
        if (changedFields.length) metadata.changedFields = changedFields;
      }
      continue;
    }
    if (typeof value === 'string') metadata[key] = value.slice(0, FIELD_LIMITS[key]);
  }
  return metadata;
}

async function record(input = {}) {
  const event = {
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId === undefined || input.targetId === null ? input.targetId : String(input.targetId),
    result: input.result || 'success',
    metadata: safeMetadata(input.metadata),
  };
  if (input.actor) event.actor = input.actor;
  if (input.actorRole) event.actorRole = input.actorRole;
  if (input.session) {
    const [createdEvent] = await AuditEvent.create([event], { session: input.session });
    return createdEvent;
  }
  return AuditEvent.create(event);
}

module.exports = { record };
