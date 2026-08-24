const asyncHandler = require('../utils/asyncHandler');
const reportService = require('../services/reportService');

function requestMetadata(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

exports.createReport = asyncHandler(async (req, res) => {
  const report = await reportService.createReport({
    user: req.user,
    input: req.body,
    ...requestMetadata(req),
  });
  res.status(201).json({ report, message: 'Your confidential matter has been sent to the pastor.' });
});

exports.listReports = asyncHandler(async (req, res) => {
  const { status, sensitivity, category, urgency, search, owner, page, limit } = req.query;
  const result = await reportService.listReports({
    user: req.user,
    filters: { status, sensitivity, category, urgency, search, owner },
    pagination: { page, limit },
  });
  res.json(result);
});

exports.getReport = asyncHandler(async (req, res) => {
  const report = await reportService.getReport({
    user: req.user,
    reportId: req.params.id,
    ...requestMetadata(req),
  });
  res.json({ report });
});

exports.updateReport = asyncHandler(async (req, res) => {
  // Only the approved editable fields are forwarded; revisions and responses are never client-writable.
  const changes = {};
  for (const field of reportService.EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) changes[field] = req.body[field];
  }

  const report = await reportService.editReport({
    user: req.user,
    reportId: req.params.id,
    changes,
    ...requestMetadata(req),
  });
  res.json({ report, message: 'Matter updated successfully.' });
});

exports.addResponse = asyncHandler(async (req, res) => {
  const report = await reportService.respond({
    user: req.user,
    reportId: req.params.id,
    message: req.body.message,
    ...requestMetadata(req),
  });
  res.status(201).json({ report, message: 'Response sent securely.' });
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const report = await reportService.transition({
    pastor: req.user,
    reportId: req.params.id,
    status: req.body.status,
    ...requestMetadata(req),
  });
  res.json({ report, message: `Matter marked as ${report.status.replaceAll('_', ' ')}.` });
});

exports.getStats = asyncHandler(async (req, res) => {
  const { stats, recent } = await reportService.getStats(req.user);
  res.json({ stats, recent });
});
