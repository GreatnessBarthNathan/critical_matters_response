const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true, select: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null, index: true },
  revokedAt: { type: Date, default: null, index: true },
  // Internal concurrency guard. API status is still derived from timestamps.
  active: { type: Boolean, default: true, required: true, select: false },
}, { timestamps: true });

invitationSchema.index({ email: 1, consumedAt: 1, revokedAt: 1, expiresAt: 1 });
invitationSchema.index({ createdBy: 1, createdAt: -1 });
invitationSchema.index({ email: 1 }, {
  unique: true,
  partialFilterExpression: { active: true },
  name: 'unique_active_invitation_email',
});
// Keep expired invitation history for 30 days before MongoDB's TTL monitor removes it.
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Invitation', invitationSchema);
