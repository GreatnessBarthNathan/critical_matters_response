const mongoose = require('mongoose');

const metadataSchema = new mongoose.Schema({
  ip: { type: String, maxlength: 100 },
  userAgent: { type: String, maxlength: 500 },
  requestId: { type: String, maxlength: 100 },
  reason: { type: String, maxlength: 500 },
  changedFields: {
    type: [{ type: String, maxlength: 100 }],
    default: undefined,
    validate: {
      validator: (fields) => !fields || fields.length <= 50,
      message: 'Audit metadata changedFields may contain at most 50 values.',
    },
  },
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

const AuditEvent = mongoose.model('AuditEvent', auditEventSchema);

// Database permissions must also prevent update/delete access in production; this model fails closed first.
AuditEvent.bulkWrite = function rejectBulkWrite() {
  return Promise.reject(new Error('AuditEvent records are append-only and cannot be changed or deleted.'));
};

module.exports = AuditEvent;
