const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true, select: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  consumedAt: { type: Date, default: null, index: true },
  revokedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

invitationSchema.index({ email: 1, consumedAt: 1, revokedAt: 1, expiresAt: 1 });
invitationSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('Invitation', invitationSchema);
