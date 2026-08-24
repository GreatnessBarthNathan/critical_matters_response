const mongoose = require('mongoose');

const STATUSES = ['new', 'in_review', 'awaiting_pastor', 'awaiting_leader', 'archived'];
const URGENCIES = ['normal', 'important', 'urgent'];
const PRIORITY_WEIGHTS = { normal: 0, important: 1, urgent: 2 };
const CATEGORIES = ['general', 'sensitive'];
const SENSITIVITIES = ['standard', 'private'];

const APPEND_ONLY_REVISIONS = 'Report revisions are append-only and cannot be changed or deleted.';

const responseSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['user', 'admin'], required: true },
  message: { type: String, required: true, trim: true },
  readByUser: { type: Boolean, default: false },
  readByPastor: { type: Boolean, default: false },
}, { timestamps: true });

const changedFieldSchema = new mongoose.Schema({
  field: { type: String, required: true, maxlength: 100 },
  previousValue: { type: mongoose.Schema.Types.Mixed },
  nextValue: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const revisionSchema = new mongoose.Schema({
  revisionNumber: { type: Number, required: true, min: 1 },
  editor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changedFields: { type: [changedFieldSchema], required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const reportSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reference: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: CATEGORIES,
    default: 'general',
  },
  sensitivity: { type: String, enum: SENSITIVITIES, default: 'standard', index: true },
  urgency: { type: String, enum: URGENCIES, default: 'normal' },
  // Denormalized so pastor triage queues can sort by priority and still paginate in the database.
  priorityWeight: { type: Number, default: 0, index: true },
  content: { type: String, required: true, trim: true },
  status: { type: String, enum: STATUSES, default: 'new', index: true },
  responses: [responseSchema],
  revisions: { type: [revisionSchema], default: [] },
  readState: {
    ownerReadAt: { type: Date, default: null },
    pastorReadAt: { type: Date, default: null },
  },
  lastActivityAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

reportSchema.set('optimisticConcurrency', true);

reportSchema.index({ owner: 1, createdAt: -1 });
reportSchema.index({ status: 1, lastActivityAt: -1 });
reportSchema.index({ priorityWeight: -1, lastActivityAt: -1 });

reportSchema.pre('validate', function syncPriorityWeight(next) {
  this.priorityWeight = PRIORITY_WEIGHTS[this.urgency] ?? 0;
  next();
});

function revisionSnapshot(revisions) {
  return JSON.stringify(revisions.map((revision) => ({
    revisionNumber: revision.revisionNumber,
    editor: String(revision.editor?._id || revision.editor),
    changedFields: revision.changedFields.map((change) => ({
      field: change.field,
      previousValue: change.previousValue,
      nextValue: change.nextValue,
    })),
    createdAt: revision.createdAt?.toISOString(),
  })));
}

// Remember the loaded history so later saves can append, but can never rewrite its prefix.
reportSchema.post('init', function recordLoadedRevisionCount() {
  this.$locals.loadedRevisionCount = this.revisions.length;
  this.$locals.loadedRevisionSnapshot = revisionSnapshot(this.revisions);
});

reportSchema.pre('save', function rejectRevisionMutation(next) {
  if (this.isNew) return next();

  // Report encryption legitimately rewrites the serialized values inside an existing
  // revision while preserving its append-only meaning. Only the report service sets
  // this private, non-persisted marker after re-encrypting the complete document.
  if (this.$locals.allowEncryptedRevisionRewrite) {
    this.$locals.allowEncryptedRevisionRewrite = false;
    return next();
  }

  const loadedCount = this.$locals.loadedRevisionCount ?? this.revisions.length;
  if (this.revisions.length < loadedCount) return next(new Error(APPEND_ONLY_REVISIONS));
  const loadedSnapshot = this.$locals.loadedRevisionSnapshot ?? revisionSnapshot(this.revisions.slice(0, loadedCount));
  if (revisionSnapshot(this.revisions.slice(0, loadedCount)) !== loadedSnapshot) {
    return next(new Error(APPEND_ONLY_REVISIONS));
  }

  return next();
});

reportSchema.post('save', function rememberSavedRevisionHistory() {
  this.$locals.loadedRevisionCount = this.revisions.length;
  this.$locals.loadedRevisionSnapshot = revisionSnapshot(this.revisions);
});

function updateTouchesRevisions(update) {
  if (Array.isArray(update)) return update.some(updateTouchesRevisions);
  if (!update || typeof update !== 'object') return false;
  return Object.entries(update).some(([key, value]) => (
    /^revisions(\.|$)/.test(key) || updateTouchesRevisions(value)
  ));
}

function rejectRevisionQueryMutation(next) {
  const update = this.getUpdate() || {};
  if (updateTouchesRevisions(update)) return next(new Error(APPEND_ONLY_REVISIONS));
  return next();
}

reportSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne'],
  rejectRevisionQueryMutation,
);

const Report = mongoose.model('Report', reportSchema);

const uncheckedBulkWrite = Report.bulkWrite.bind(Report);
Report.bulkWrite = function rejectBulkRevisionMutation(operations, ...options) {
  const touchesRevisions = Array.isArray(operations) && operations.some((operation) => {
    const write = operation?.updateOne || operation?.updateMany || operation?.replaceOne;
    return updateTouchesRevisions(write?.update || write?.replacement);
  });
  if (touchesRevisions) return Promise.reject(new Error(APPEND_ONLY_REVISIONS));
  return uncheckedBulkWrite(operations, ...options);
};

Report.STATUSES = STATUSES;
Report.URGENCIES = URGENCIES;
Report.PRIORITY_WEIGHTS = PRIORITY_WEIGHTS;
Report.CATEGORIES = CATEGORIES;
Report.SENSITIVITIES = SENSITIVITIES;
Report.APPEND_ONLY_REVISIONS = APPEND_ONLY_REVISIONS;

module.exports = Report;
