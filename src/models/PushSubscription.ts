const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true, trim: true, maxlength: 2048 },
  keys: {
    p256dh: { type: String, required: true, maxlength: 1024 },
    auth: { type: String, required: true, maxlength: 512 },
  },
  expirationTime: { type: Number, default: null },
}, { timestamps: true, strict: 'throw' });

pushSubscriptionSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
