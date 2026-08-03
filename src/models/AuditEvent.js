const mongoose = require('mongoose');

const metadataSchema = new mongoose.Schema({
  ip: { type: String, maxlength: 100 },
  userAgent: { type: String, maxlength: 500 },
  requestId: { type: String, maxlength: 100 },
  reason: { type: String, maxlength: 500 },
  changedFields: { type: [String], default: undefined },
}, { _id: false, strict: 'throw' });

const auditEventSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorRole: { type: String, enum: ['user', 'pastor'] },
  action: { type: String, required: true, trim: true, maxlength: 100 },
  targetType: { type: String, required: true, trim: true, maxlength: 100 },
  targetId: { type: String, required: true, trim: true, maxlength: 100 },
  result: { type: String, required: true, enum: ['success', 'failure'] },
  metadata: { type: metadataSchema, default: () => ({}) },
}, { timestamps: true, strict: 'throw' });

function rejectMutation(next) {
  next(new Error('AuditEvent records are append-only and cannot be changed or deleted.'));
}

auditEventSchema.pre('save', function rejectExistingDocumentSaves(next) {
  if (!this.isNew) return rejectMutation(next);
  return next();
});

auditEventSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  rejectMutation,
);
auditEventSchema.pre('deleteOne', { document: true, query: false }, rejectMutation);

module.exports = mongoose.model('AuditEvent', auditEventSchema);
