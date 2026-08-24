const crypto = require('crypto');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const auditService = require('./auditService');
const pushNotificationService = require('./pushNotificationService');
const {
  encryptReportValue,
  decryptLegacyOrEncryptedValue,
  isEncryptedReportValue,
} = require('../utils/reportEncryption');

const OWNER_FIELDS = 'firstName lastName email ministry avatarColor';
const OWNER_DETAIL_FIELDS = 'firstName lastName email phone ministry avatarColor';
const AUTHOR_FIELDS = 'firstName lastName role avatarColor';
const EDITABLE_FIELDS = ['title', 'category', 'sensitivity', 'urgency', 'content'];
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 200;

function serviceError(code, status, message) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function reportNotFound() {
  return serviceError('REPORT_NOT_FOUND', 404, 'This matter was not found or you do not have access.');
}

function reportArchived() {
  return serviceError('REPORT_ARCHIVED', 409, 'This matter is archived and read-only.');
}

function invalidStatus() {
  return serviceError('INVALID_STATUS', 400, 'That status is not part of the approved matter lifecycle.');
}

function invalidTransition() {
  return serviceError('INVALID_REPORT_TRANSITION', 409, 'That matter status transition is not allowed.');
}

function forbidden() {
  return serviceError('REPORT_FORBIDDEN', 403, 'Pastor access is required for this action.');
}

function editForbidden() {
  return serviceError('REPORT_FORBIDDEN', 403, 'Only the leader who submitted this matter may edit it.');
}

function validationError(message) {
  return serviceError('VALIDATION_FAILED', 400, message);
}

function reportUnavailable() {
  return serviceError('REPORT_UNAVAILABLE', 503, 'This matter is temporarily unavailable. Please try again later.');
}

function transformReportText(report, transform) {
  if (!report) return report;
  for (const field of ['title', 'content']) {
    if (typeof report[field] === 'string') report[field] = transform(report[field]);
  }
  for (const response of report.responses || []) {
    if (typeof response.message === 'string') response.message = transform(response.message);
  }
  for (const revision of report.revisions || []) {
    for (const change of revision.changedFields || []) {
      if (!['title', 'content'].includes(change.field)) continue;
      if (typeof change.previousValue === 'string') change.previousValue = transform(change.previousValue);
      if (typeof change.nextValue === 'string') change.nextValue = transform(change.nextValue);
    }
  }
  return report;
}

function encryptReportText(report) {
  const hadLoadedRevisions = Number.isInteger(report?.$locals?.loadedRevisionCount);
  const encrypted = transformReportText(report, (value) => (isEncryptedReportValue(value) ? value : encryptReportValue(value)));
  if (hadLoadedRevisions) report.$locals.allowEncryptedRevisionRewrite = true;
  return encrypted;
}

function decryptReportText(report) {
  try {
    return transformReportText(report, decryptLegacyOrEncryptedValue);
  } catch (_error) {
    throw reportUnavailable();
  }
}

function createReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `CMR-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function actorId(user) {
  return user?._id || user?.id;
}

function safeMetadata({ ip, userAgent, changedFields, reason } = {}) {
  const metadata = { ip: ip || '', userAgent: userAgent || '' };
  if (changedFields?.length) metadata.changedFields = changedFields;
  if (reason) metadata.reason = reason;
  return metadata;
}

function isPastor(user) {
  return user?.role === 'admin';
}

// Browser notifications are a convenience channel, never part of report persistence. A delivery
// problem must not make a confidential report or response fail after its transaction committed.
function sendPushBestEffort(send) {
  void Promise.resolve()
    .then(send)
    .catch((error) => console.error('Push notification delivery failed:', error.message));
}

// Leaders may only ever reach their own matters; pastors triage every matter.
function ownershipScope(user) {
  return isPastor(user) ? {} : { owner: actorId(user) };
}

function ensureValidReportId(reportId) {
  if (typeof reportId !== 'string' || !mongoose.isObjectIdOrHexString(reportId)) throw reportNotFound();
}

async function findAccessibleReport(user, reportId, session) {
  ensureValidReportId(reportId);
  const report = await Report.findOne({ _id: reportId, ...ownershipScope(user) }).session(session || null);
  if (!report) throw reportNotFound();
  return report;
}

async function record({ user, action, report, result = 'success', ip, userAgent, changedFields, reason, session }) {
  await auditService.record({
    actor: actorId(user),
    actorRole: user.role,
    action,
    targetType: 'report',
    targetId: report._id || report.id || report,
    result,
    metadata: safeMetadata({ ip, userAgent, changedFields, reason }),
    session,
  });
}

async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    try {
      await session.withTransaction(async () => {
        result = await work(session);
      });
    } catch (error) {
      if (error?.name === 'VersionError') {
        throw serviceError('REPORT_CONFLICT', 409, 'This matter changed while it was being updated. Please retry.');
      }
      throw error;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

function requireEnumValue(name, value, allowed) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw validationError(`Invalid ${name}.`);
  }
  return value;
}

function sanitizedCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('A subject and matter details are required.');
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (!title || !content) throw validationError('A subject and matter details are required.');
  if (title.length > 160 || content.length > 10000) throw validationError('The matter is longer than the allowed limit.');

  return {
    title,
    content,
    ...(input.category !== undefined && {
      category: requireEnumValue('category', input.category, Report.CATEGORIES),
    }),
    ...(input.sensitivity !== undefined && {
      sensitivity: requireEnumValue('sensitivity', input.sensitivity, Report.SENSITIVITIES),
    }),
    ...(input.urgency !== undefined && {
      urgency: requireEnumValue('urgency', input.urgency, Report.URGENCIES),
    }),
  };
}

async function createReport({ user, input = {}, ip, userAgent }) {
  const safeInput = sanitizedCreateInput(input);
  const report = await inTransaction(async (session) => {
    const [created] = await Report.create([{
      owner: actorId(user),
      reference: createReference(),
      ...safeInput,
      title: encryptReportValue(safeInput.title),
      content: encryptReportValue(safeInput.content),
      status: 'new',
      readState: { ownerReadAt: new Date(), pastorReadAt: null },
    }], { session });
    await record({ user, action: 'report.create', report: created, ip, userAgent, session });
    return created;
  });

  decryptReportText(report);
  await report.populate('owner', OWNER_FIELDS);
  sendPushBestEffort(() => pushNotificationService.notifyAdmins({
    title: 'New private matter',
    body: 'A church leader has shared a matter for your review.',
    tag: `report-${report.id}`,
    url: `/app/reports/${report.id}`,
  }));
  return report;
}

function optionalFilter(name, value, allowed) {
  if (!value || value === 'all') return undefined;
  return requireEnumValue(name, value, allowed);
}

function buildListQuery({ user, filters = {} }) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    throw validationError('Invalid report filters.');
  }
  const query = { ...ownershipScope(user) };
  const { status, sensitivity, category, urgency, search, owner } = filters;

  if (status && status !== 'all') {
    if (status === 'open') query.status = { $ne: 'archived' };
    else if (typeof status === 'string' && Report.STATUSES.includes(status)) query.status = status;
    else throw invalidStatus();
  }
  const safeSensitivity = optionalFilter('sensitivity', sensitivity, Report.SENSITIVITIES);
  const safeCategory = optionalFilter('category', category, Report.CATEGORIES);
  const safeUrgency = optionalFilter('urgency', urgency, Report.URGENCIES);
  if (safeSensitivity) query.sensitivity = safeSensitivity;
  if (safeCategory) query.category = safeCategory;
  if (safeUrgency) query.urgency = safeUrgency;

  if (owner !== undefined && owner !== '' && owner !== 'all') {
    if (typeof owner !== 'string' || !mongoose.isObjectIdOrHexString(owner)) {
      throw validationError('Invalid report owner filter.');
    }
    if (isPastor(user)) query.owner = owner;
  }

  if (search !== undefined && search !== '') {
    if (typeof search !== 'string' || search.length > MAX_SEARCH_LENGTH) {
      throw validationError(`Search must be at most ${MAX_SEARCH_LENGTH} characters.`);
    }
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { reference: { $regex: escaped, $options: 'i' } },
    ];
  }
  return query;
}

async function listReports({ user, filters = {}, pagination = {} }) {
  const query = buildListQuery({ user, filters });
  const parsedPage = Number.parseInt(pagination.page, 10);
  const parsedLimit = Number.parseInt(pagination.limit, 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_PAGE_SIZE) : 20;
  const sort = isPastor(user) ? { priorityWeight: -1, lastActivityAt: -1 } : { lastActivityAt: -1 };

  const [reports, total] = await Promise.all([
    Report.find(query)
      .populate('owner', OWNER_FIELDS)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit),
    Report.countDocuments(query),
  ]);

  await Promise.all(reports.map((report) => decryptReportText(report)));

  return {
    reports,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    },
  };
}

async function getReport({ user, reportId, markRead = true, ip, userAgent }) {
  const report = await inTransaction(async (session) => {
    const found = await findAccessibleReport(user, reportId, session);
    decryptReportText(found);
    const openedByPastor = isPastor(user) && found.status === 'new';
    let changed = false;

    if (openedByPastor) {
      found.status = 'in_review';
      found.lastActivityAt = new Date();
      changed = true;
    }

    if (markRead) {
      const now = new Date();
      if (isPastor(user)) found.readState.pastorReadAt = now;
      else found.readState.ownerReadAt = now;
      for (const response of found.responses) {
        if (isPastor(user) && response.authorRole === 'user' && !response.readByPastor) response.readByPastor = true;
        if (!isPastor(user) && response.authorRole === 'admin' && !response.readByUser) response.readByUser = true;
      }
      changed = true;
    }

    if (changed) {
      encryptReportText(found);
      await found.save({ session });
    }
    await record({
      user,
      action: openedByPastor ? 'report.open' : 'report.view',
      report: found,
      ip,
      userAgent,
      session,
    });
    return found;
  });

  await report.populate('owner', OWNER_DETAIL_FIELDS);
  await report.populate('responses.author', AUTHOR_FIELDS);
  await report.populate('revisions.editor', AUTHOR_FIELDS);
  decryptReportText(report);
  return report;
}

function normalizedEditValue(field, value) {
  if (typeof value !== 'string') throw validationError(`Invalid ${field}.`);
  const trimmed = value.trim();
  if ((field === 'title' || field === 'content') && !trimmed) {
    throw validationError('A subject and matter details are required.');
  }
  if (field === 'title' && trimmed.length > 160) throw validationError('The subject is longer than the allowed limit.');
  if (field === 'content' && trimmed.length > 10000) throw validationError('The matter details are longer than the allowed limit.');
  if (field === 'category') return requireEnumValue(field, trimmed, Report.CATEGORIES);
  if (field === 'sensitivity') return requireEnumValue(field, trimmed, Report.SENSITIVITIES);
  if (field === 'urgency') return requireEnumValue(field, trimmed, Report.URGENCIES);
  return trimmed;
}

async function editReport({ user, reportId, changes = {}, ip, userAgent }) {
  if (isPastor(user)) throw editForbidden();
  ensureValidReportId(reportId);
  const report = await inTransaction(async (session) => {
    const found = await Report.findOne({ _id: reportId, owner: actorId(user) }).session(session);
    if (!found) throw reportNotFound();
    decryptReportText(found);
    if (found.status === 'archived') throw reportArchived();

    const changedFields = [];
    for (const field of EDITABLE_FIELDS) {
      if (changes[field] === undefined) continue;
      const nextValue = normalizedEditValue(field, changes[field]);
      const previousValue = found[field];
      if (nextValue === previousValue) continue;
      changedFields.push({ field, previousValue, nextValue });
      found[field] = nextValue;
    }

    if (!changedFields.length) return found;

    found.revisions.push({
      revisionNumber: found.revisions.length + 1,
      editor: actorId(user),
      changedFields,
      createdAt: new Date(),
    });
    found.lastActivityAt = new Date();
    found.readState.ownerReadAt = new Date();
    found.readState.pastorReadAt = null;
    encryptReportText(found);
    await found.save({ session });
    await record({
      user,
      action: 'report.edit',
      report: found,
      ip,
      userAgent,
      changedFields: changedFields.map((change) => change.field),
      session,
    });
    return found;
  });

  await report.populate('owner', OWNER_FIELDS);
  await report.populate('revisions.editor', AUTHOR_FIELDS);
  decryptReportText(report);
  return report;
}

async function respond({ user, reportId, message, ip, userAgent }) {
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) throw validationError('A response message is required.');
  if (trimmed.length > 5000) throw validationError('The response is longer than the allowed limit.');

  const report = await inTransaction(async (session) => {
    const found = await findAccessibleReport(user, reportId, session);
    decryptReportText(found);
    if (found.status === 'archived') throw reportArchived();

    const pastorAuthored = isPastor(user);
    found.responses.push({
      author: actorId(user),
      authorRole: user.role,
      message: trimmed,
      readByUser: !pastorAuthored,
      readByPastor: pastorAuthored,
    });
    found.status = pastorAuthored ? 'awaiting_leader' : 'awaiting_pastor';
    found.lastActivityAt = new Date();
    if (pastorAuthored) {
      found.readState.pastorReadAt = new Date();
      found.readState.ownerReadAt = null;
    } else {
      found.readState.ownerReadAt = new Date();
      found.readState.pastorReadAt = null;
    }
    encryptReportText(found);
    await found.save({ session });
    await record({ user, action: 'report.respond', report: found, ip, userAgent, session });
    return found;
  });

  await report.populate('owner', OWNER_FIELDS);
  await report.populate('responses.author', AUTHOR_FIELDS);
  if (isPastor(user)) {
    sendPushBestEffort(() => pushNotificationService.deliverToUsers([report.owner._id || report.owner], {
      title: 'New private response',
      body: 'You have a new response to one of your matters.',
      tag: `report-${report.id}`,
      url: `/app/reports/${report.id}`,
    }));
  } else {
    sendPushBestEffort(() => pushNotificationService.notifyAdmins({
      title: 'New private response',
      body: 'A church leader has replied to a matter.',
      tag: `report-${report.id}`,
      url: `/app/reports/${report.id}`,
    }));
  }
  decryptReportText(report);
  return report;
}

async function transition({ pastor, reportId, status, ip, userAgent }) {
  if (!isPastor(pastor)) throw forbidden();
  if (typeof status !== 'string' || !Report.STATUSES.includes(status)) throw invalidStatus();
  if (status !== 'archived' && status !== 'in_review') throw invalidTransition();
  ensureValidReportId(reportId);

  const report = await inTransaction(async (session) => {
    const found = await Report.findById(reportId).session(session);
    if (!found) throw reportNotFound();
    if (found.status === status) return found;

    const isArchive = status === 'archived' && found.status !== 'archived';
    const isReopen = found.status === 'archived' && status === 'in_review';
    if (!isArchive && !isReopen) throw invalidTransition();

    found.status = status;
    found.lastActivityAt = new Date();
    found.readState.pastorReadAt = new Date();
    found.readState.ownerReadAt = null;
    encryptReportText(found);
    await found.save({ session });
    await record({
      user: pastor,
      action: 'report.transition',
      report: found,
      ip,
      userAgent,
      reason: status,
      session,
    });
    return found;
  });

  await report.populate('owner', OWNER_FIELDS);
  decryptReportText(report);
  return report;
}

async function getStats(user) {
  const scope = ownershipScope(user);
  const [total, newCount, inReview, awaitingPastor, awaitingLeader, archived, privateCount, recent] = await Promise.all([
    Report.countDocuments(scope),
    Report.countDocuments({ ...scope, status: 'new' }),
    Report.countDocuments({ ...scope, status: 'in_review' }),
    Report.countDocuments({ ...scope, status: 'awaiting_pastor' }),
    Report.countDocuments({ ...scope, status: 'awaiting_leader' }),
    Report.countDocuments({ ...scope, status: 'archived' }),
    Report.countDocuments({ ...scope, sensitivity: 'private' }),
    Report.find(scope)
      .populate('owner', 'firstName lastName avatarColor')
      .sort(isPastor(user) ? { priorityWeight: -1, lastActivityAt: -1 } : { lastActivityAt: -1 })
      .limit(5),
  ]);

  return {
    stats: {
      total,
      new: newCount,
      inReview,
      awaitingPastor,
      awaitingLeader,
      archived,
      open: total - archived,
      private: privateCount,
    },
    recent: recent.map((report) => decryptReportText(report)),
  };
}

module.exports = {
  EDITABLE_FIELDS,
  createReport,
  listReports,
  getReport,
  editReport,
  respond,
  transition,
  getStats,
};
