const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true, maxlength: 50 },
  lastName: { type: String, required: true, trim: true, maxlength: 50 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, minlength: 8, select: false },
  // Retained only so existing records can be read during migration. New accounts never receive a legacy recovery key.
  recoveryKeyHash: { type: String, select: false },
  sessionVersion: { type: Number, default: 0 },
  recoveryCodeHashes: { type: [String], default: [], select: false },
  totp: {
    enabled: { type: Boolean, default: false },
    encryptedSecret: { type: String, default: '', select: false },
  },
  assistedReset: {
    tokenHash: { type: String, default: '', select: false },
    expiresAt: Date,
  },
  role: { type: String, enum: ['user', 'pastor'], default: 'user', index: true },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  ministry: { type: String, trim: true, maxlength: 100, default: '' },
  bio: { type: String, trim: true, maxlength: 500, default: '' },
  avatarColor: { type: String, default: '#315d56' },
  isActive: { type: Boolean, default: true },
  passwordChangedAt: Date,
  lastLoginAt: Date,
}, { timestamps: true });

userSchema.pre('save', async function hashSensitiveValues(next) {
  try {
    if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
    if (this.isModified('recoveryKeyHash')) this.recoveryKeyHash = await bcrypt.hash(this.recoveryKeyHash, 12);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    firstName: this.firstName,
    lastName: this.lastName,
    email: this.email,
    role: this.role,
    phone: this.phone,
    ministry: this.ministry,
    bio: this.bio,
    avatarColor: this.avatarColor,
    isActive: this.isActive,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
  };
};

module.exports = mongoose.model('User', userSchema);
