const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const AuditEvent = require('../models/AuditEvent');

const MAX_PAGE_SIZE = 100;
const MAX_FILTER_LENGTH = 100;
const RESULTS = ['success', 'failure'];
const SAFE_METADATA_KEYS = ['ip', 'userAgent', 'requestId', 'reason', 'changedFields'];

function validationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_FAILED';
  error.status = 400;
  return error;
}

function safeString(name, value) {
  if (value === undefined || value === '' || value === 'all') return undefined;
  if (typeof value !== 'string' || value.length > MAX_FILTER_LENGTH) {
    throw validationError(`Invalid ${name} filter.`);
  }
  return value;
}

function safeDate(name, value) {
  if (value === undefined || value === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw validationError(`Invalid ${name} filter.`);
  return date;
}

function buildQuery(params) {
  const query = {};

  const action = safeString('action', params.action);
  const targetType = safeString('targetType', params.targetType);
  const targetId = safeString('targetId', params.targetId);
  if (action) query.action = action;
  if (targetType) query.targetType = targetType;
  if (targetId) query.targetId = targetId;

  const result = safeString('result', params.result);
  if (result) {
    if (!RESULTS.includes(result)) throw validationError('Invalid result filter.');
    query.result = result;
  }

  const actor = safeString('actor', params.actor);
  if (actor) {
    if (!mongoose.isObjectIdOrHexString(actor)) throw validationError('Invalid actor filter.');
    query.actor = actor;
  }

  const from = safeDate('from', params.from);
  const to = safeDate('to', params.to);
  if (from || to) {
    query.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  }

  return query;
}

// Only metadata proven safe by the audit service ever leaves the server.
function auditView(event) {
  const metadata = {};
  for (const key of SAFE_METADATA_KEYS) {
    const value = event.metadata?.[key];
    if (value !== undefined && value !== null && value !== '') metadata[key] = value;
  }
  return {
    id: String(event._id),
    actor: event.actor
      ? {
        id: String(event.actor._id || event.actor),
        firstName: event.actor.firstName,
        lastName: event.actor.lastName,
      }
      : null,
    actorRole: event.actorRole ?? null,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    result: event.result,
    metadata,
    createdAt: event.createdAt,
  };
}

exports.list = asyncHandler(async (req, res) => {
  const query = buildQuery(req.query);
  const parsedPage = Number.parseInt(req.query.page, 10);
  const parsedLimit = Number.parseInt(req.query.limit, 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_PAGE_SIZE) : 25;

  const [events, total] = await Promise.all([
    AuditEvent.find(query)
      .populate('actor', 'firstName lastName')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditEvent.countDocuments(query),
  ]);

  res.json({
    events: events.map(auditView),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    },
  });
});
