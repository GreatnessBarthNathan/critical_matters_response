const crypto = require('crypto');
const Report = require('../models/Report');
const asyncHandler = require('../utils/asyncHandler');

function createReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `CMR-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function reportScope(user) {
  return user.role === 'pastor' ? {} : { owner: user.id };
}

exports.createReport = asyncHandler(async (req, res) => {
  const { title, category, sensitivity, urgency, content } = req.body;
  if (!title?.trim() || !content?.trim()) {
    res.status(400);
    throw new Error('A subject and report details are required.');
  }

  const report = await Report.create({
    owner: req.user.id,
    reference: createReference(),
    title: title.trim(),
    category,
    sensitivity,
    urgency,
    content: content.trim(),
  });
  await report.populate('owner', 'firstName lastName email ministry avatarColor');
  res.status(201).json({ report, message: 'Your confidential report has been sent to the pastor.' });
});

exports.listReports = asyncHandler(async (req, res) => {
  const query = { ...reportScope(req.user) };
  const { status, sensitivity, category, search, owner } = req.query;
  if (status && status !== 'all') query.status = status;
  if (sensitivity && sensitivity !== 'all') query.sensitivity = sensitivity;
  if (category && category !== 'all') query.category = category;
  if (owner && req.user.role === 'pastor') query.owner = owner;
  if (search) {
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { reference: { $regex: escaped, $options: 'i' } },
      { content: { $regex: escaped, $options: 'i' } },
    ];
  }

  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const [reports, total] = await Promise.all([
    Report.find(query)
      .populate('owner', 'firstName lastName email ministry avatarColor')
      .sort({ lastActivityAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Report.countDocuments(query),
  ]);

  res.json({ reports, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

exports.getReport = asyncHandler(async (req, res) => {
  const report = await Report.findOne({ _id: req.params.id, ...reportScope(req.user) })
    .populate('owner', 'firstName lastName email phone ministry avatarColor')
    .populate('responses.author', 'firstName lastName role avatarColor');
  if (!report) {
    res.status(404);
    throw new Error('Report not found or you do not have access.');
  }

  let changed = false;
  report.responses.forEach((response) => {
    if (req.user.role === 'pastor' && response.authorRole === 'user' && !response.readByPastor) {
      response.readByPastor = true;
      changed = true;
    }
    if (req.user.role === 'user' && response.authorRole === 'pastor' && !response.readByUser) {
      response.readByUser = true;
      changed = true;
    }
  });
  if (changed) await report.save();
  res.json({ report });
});

exports.updateReport = asyncHandler(async (req, res) => {
  const report = await Report.findOne({ _id: req.params.id, owner: req.user.id });
  if (!report) {
    res.status(404);
    throw new Error('Report not found or cannot be edited by this account.');
  }
  if (report.status === 'closed') {
    res.status(400);
    throw new Error('A closed report cannot be edited. Ask the pastor to reopen it.');
  }

  ['title', 'category', 'sensitivity', 'urgency', 'content'].forEach((field) => {
    if (req.body[field] !== undefined) report[field] = req.body[field];
  });
  report.lastActivityAt = new Date();
  await report.save();
  await report.populate('owner', 'firstName lastName email ministry avatarColor');
  res.json({ report, message: 'Report updated successfully.' });
});

exports.addResponse = asyncHandler(async (req, res) => {
  const message = req.body.message?.trim();
  if (!message) {
    res.status(400);
    throw new Error('A response message is required.');
  }

  const report = await Report.findOne({ _id: req.params.id, ...reportScope(req.user) });
  if (!report) {
    res.status(404);
    throw new Error('Report not found or you do not have access.');
  }
  if (report.status === 'closed') {
    res.status(400);
    throw new Error('This conversation is closed.');
  }

  report.responses.push({
    author: req.user.id,
    authorRole: req.user.role,
    message,
    readByUser: req.user.role === 'user',
    readByPastor: req.user.role === 'pastor',
  });
  report.lastActivityAt = new Date();
  report.status = req.user.role === 'pastor' ? 'responded' : 'in_review';
  await report.save();
  await report.populate('owner', 'firstName lastName email ministry avatarColor');
  await report.populate('responses.author', 'firstName lastName role avatarColor');
  res.status(201).json({ report, message: 'Response sent securely.' });
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const allowed = ['submitted', 'in_review', 'responded', 'closed'];
  if (!allowed.includes(req.body.status)) {
    res.status(400);
    throw new Error('Invalid report status.');
  }

  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status, lastActivityAt: new Date() },
    { new: true, runValidators: true },
  ).populate('owner', 'firstName lastName email ministry avatarColor');
  if (!report) {
    res.status(404);
    throw new Error('Report not found.');
  }
  res.json({ report, message: `Report marked as ${req.body.status.replace('_', ' ')}.` });
});

exports.getStats = asyncHandler(async (req, res) => {
  const scope = reportScope(req.user);
  const [total, submitted, inReview, responded, closed, privateCount, recent] = await Promise.all([
    Report.countDocuments(scope),
    Report.countDocuments({ ...scope, status: 'submitted' }),
    Report.countDocuments({ ...scope, status: 'in_review' }),
    Report.countDocuments({ ...scope, status: 'responded' }),
    Report.countDocuments({ ...scope, status: 'closed' }),
    Report.countDocuments({ ...scope, sensitivity: 'private' }),
    Report.find(scope).populate('owner', 'firstName lastName avatarColor').sort({ lastActivityAt: -1 }).limit(5),
  ]);
  res.json({ stats: { total, submitted, inReview, responded, closed, private: privateCount }, recent });
});
