const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['user', 'pastor'], required: true },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  readByUser: { type: Boolean, default: false },
  readByPastor: { type: Boolean, default: false },
}, { timestamps: true });

const reportSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reference: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  category: {
    type: String,
    enum: ['general', 'family', 'health', 'financial', 'ministry', 'relationship', 'other'],
    default: 'general',
  },
  sensitivity: { type: String, enum: ['standard', 'private'], default: 'standard', index: true },
  urgency: { type: String, enum: ['normal', 'important', 'urgent'], default: 'normal' },
  content: { type: String, required: true, trim: true, maxlength: 10000 },
  status: { type: String, enum: ['submitted', 'in_review', 'responded', 'closed'], default: 'submitted', index: true },
  responses: [responseSchema],
  lastActivityAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

reportSchema.index({ owner: 1, createdAt: -1 });
reportSchema.index({ status: 1, lastActivityAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
