const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const auditService = require('./auditService');
const { createTotpSetup, verifyTotp, toQrDataUrl } = require('../utils/totp');
const { decryptSecret, encryptSecret, hashToken } = require('../utils/crypto');
const { signPurposeToken } = require('../utils/authToken');

const HASH_ROUNDS = 12;
const INVALID_RECOVERY = 'INVALID_RECOVERY';
const INVALID_TOTP = 'INVALID_TOTP';
const PENDING_TOTP_TTL_MS = 5 * 60 * 1000;
// This is deliberately constant and valid: every unknown/missing candidate pays one bcrypt comparison.
const RECOVERY_DUMMY_HASH = '$2b$12$5sD6F66jtGrHW1gHe9X9xetldC4v7s.VR7eNLv0qfQNQ8DFfFsH5i';

function authError(code, status, message = code) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function normalizeRecoveryCode(value = '') {
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function recoveryFingerprint(value) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update(`cmr:recovery-code:v1\0${normalizeRecoveryCode(value)}`)
    .digest('base64url');
}

function generateRecoveryCodes() {
  return Array.from({ length: 8 }, () => {
    const compact = crypto.randomBytes(16).toString('hex').toUpperCase();
    return compact.match(/.{1,4}/g).join('-');
  });
}

async function hashRecoveryCodes(codes) {
  return Promise.all(codes.map(async (code) => ({
    fingerprint: recoveryFingerprint(code),
    bcryptHash: await bcrypt.hash(normalizeRecoveryCode(code), HASH_ROUNDS),
  })));
}

async function bestEffortAudit(input) {
  try {
    await auditService.record(input);
  } catch (_error) {
    // Authentication and neutral recovery failures must not become a 500 because auditing is unavailable.
  }
}

function requestMetadata(metadata) {
  return { ip: metadata?.ip || '', userAgent: metadata?.userAgent || '' };
}

function invalidRecovery() {
  return authError(INVALID_RECOVERY, 400, INVALID_RECOVERY);
}

function invalidTotp() {
  return authError(INVALID_TOTP, 401, 'Two-factor verification failed. Please sign in again.');
}

function verifyPurposeToken(token, purpose) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || payload.purpose !== purpose || !payload.sub) throw new Error('invalid purpose');
    return payload;
  } catch (_error) {
    throw invalidTotp();
  }
}

function assistedResetMinutes() {
  const value = Number(process.env.ASSISTED_RESET_TTL_MINUTES || 15);
  return Number.isInteger(value) && value >= 1 && value <= 60 ? value : 15;
}

async function recordSuccessfulLogin(user, metadata, { pendingTotp } = {}) {
  const session = await mongoose.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      const filter = { _id: user._id, isActive: true };
      const update = { $set: { lastLoginAt: new Date() } };
      if (pendingTotp) {
        Object.assign(filter, {
          sessionVersion: pendingTotp.sv,
          'pendingTotp.jtiHash': hashToken(pendingTotp.jti),
          'pendingTotp.expiresAt': { $gt: new Date() },
        });
        Object.assign(update.$set, { 'pendingTotp.jtiHash': '', 'pendingTotp.expiresAt': null });
      } else {
        Object.assign(update.$set, { 'pendingTotp.jtiHash': '', 'pendingTotp.expiresAt': null });
      }
      updated = await User.findOneAndUpdate(
        filter,
        update,
        { new: true, session },
      );
      if (!updated) throw pendingTotp ? invalidTotp() : authError('INVALID_CREDENTIALS', 401, 'The email or password is incorrect.');
      await auditService.record({
        actor: updated.id, actorRole: updated.role, action: 'auth.login', targetType: 'user', targetId: updated.id,
        result: 'success', metadata: requestMetadata(metadata), session,
      });
      if (pendingTotp) {
        await auditService.record({
          actor: updated.id, actorRole: updated.role, action: 'auth.totp.verify', targetType: 'user', targetId: updated.id,
          result: 'success', metadata: requestMetadata(metadata), session,
        });
      }
    });
    return updated;
  } finally {
    await session.endSession();
  }
}

async function issuePendingTotpLogin(user, metadata) {
  const jti = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + PENDING_TOTP_TTL_MS);
  const session = await mongoose.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      updated = await User.findOneAndUpdate(
        { _id: user._id, isActive: true, sessionVersion: user.sessionVersion, 'totp.enabled': true },
        { $set: { 'pendingTotp.jtiHash': hashToken(jti), 'pendingTotp.expiresAt': expiresAt } },
        { new: true, session },
      );
      if (!updated) throw authError('INVALID_CREDENTIALS', 401, 'The email or password is incorrect.');
      await auditService.record({
        actor: updated.id, actorRole: updated.role, action: 'auth.login.pending_totp', targetType: 'user', targetId: updated.id,
        result: 'success', metadata: requestMetadata(metadata), session,
      });
    });
    return {
      user: updated,
      pendingToken: signPurposeToken({ sub: updated.id, sv: updated.sessionVersion, purpose: 'totp-login', jti }, '5m'),
    };
  } finally {
    await session.endSession();
  }
}

async function login({ email, password, metadata } = {}) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user || !user.isActive || !(await user.comparePassword(password || ''))) {
    await bestEffortAudit({
      action: 'auth.login', targetType: 'user', targetId: 'unknown', result: 'failure', metadata: requestMetadata(metadata),
    });
    throw authError('INVALID_CREDENTIALS', 401, 'The email or password is incorrect.');
  }

  if (user.totp?.enabled) {
    return { ...(await issuePendingTotpLogin(user, metadata)), requiresTotp: true };
  }

  return { user: await recordSuccessfulLogin(user, metadata), requiresTotp: false };
}

async function beginTotpSetup(user, { currentPassword, currentTotp } = {}, metadata) {
  let replacementOf = '';
  if (user.totp?.enabled) {
    const currentUser = await User.findById(user.id || user._id).select('+password +totp.encryptedSecret');
    let validTotp = false;
    try {
      validTotp = Boolean(currentUser && verifyTotp(decryptSecret(currentUser.totp.encryptedSecret), currentTotp));
    } catch (_error) {
      validTotp = false;
    }
    if (!currentUser || !(await currentUser.comparePassword(currentPassword || '')) || !validTotp) {
      await bestEffortAudit({
        actor: user.id || user._id, actorRole: user.role, action: 'auth.totp.replace', targetType: 'user', targetId: user.id || user._id,
        result: 'failure', metadata: requestMetadata(metadata),
      });
      throw invalidTotp();
    }
    replacementOf = hashToken(currentUser.totp.encryptedSecret);
  }
  const setup = createTotpSetup(user.email);
  const encryptedSecret = encryptSecret(setup.secret);
  const setupToken = signPurposeToken({ sub: user.id || user._id, purpose: 'totp-setup', encryptedSecret, replacementOf }, '5m');
  // This is intentionally process-local convenience for service callers. HTTP callers receive the
  // same signed value only in the short-lived, HTTP-only setup cookie.
  user.$locals = user.$locals || {};
  user.$locals.totpSetupToken = setupToken;
  return {
    otpauthUrl: setup.otpauthUrl,
    qrDataUrl: await toQrDataUrl(setup.otpauthUrl),
    setupToken,
  };
}

async function confirmTotpSetup(user, token, setupToken, metadata) {
  const setup = verifyPurposeToken(setupToken || user.$locals?.totpSetupToken, 'totp-setup');
  if (String(setup.sub) !== String(user.id || user._id) || typeof setup.encryptedSecret !== 'string') throw invalidTotp();

  const currentState = await User.findById(user.id || user._id).select('+totp.encryptedSecret');
  if (!currentState) throw invalidTotp();
  if (currentState.totp?.enabled) {
    if (!setup.replacementOf || hashToken(currentState.totp.encryptedSecret) !== setup.replacementOf) throw invalidTotp();
  } else if (setup.replacementOf) {
    throw invalidTotp();
  }

  let secret;
  try {
    secret = decryptSecret(setup.encryptedSecret);
  } catch (_error) {
    throw invalidTotp();
  }
  if (!verifyTotp(secret, token)) {
    await bestEffortAudit({
      actor: user.id || user._id, actorRole: user.role, action: 'auth.totp.enable', targetType: 'user', targetId: user.id || user._id,
      result: 'failure', metadata: requestMetadata(metadata),
    });
    throw invalidTotp();
  }

  const recoveryCodes = generateRecoveryCodes();
  const recoveryCodeHashes = await hashRecoveryCodes(recoveryCodes);
  const session = await mongoose.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      updated = await User.findByIdAndUpdate(
        user.id || user._id,
        { $set: { 'totp.enabled': true, 'totp.encryptedSecret': setup.encryptedSecret, recoveryCodeHashes } },
        { new: true, session },
      );
      await auditService.record({
        actor: user.id || user._id, actorRole: user.role, action: 'auth.totp.enable', targetType: 'user', targetId: user.id || user._id,
        result: 'success', metadata: requestMetadata(metadata), session,
      });
    });
    return { user: updated, recoveryCodes };
  } finally {
    await session.endSession();
  }
}

async function verifyLoginTotp({ pendingToken, token, metadata } = {}) {
  const pending = verifyPurposeToken(pendingToken, 'totp-login');
  if (!Number.isInteger(pending.sv) || typeof pending.jti !== 'string' || pending.jti.length < 32) throw invalidTotp();
  const user = await User.findById(pending.sub).select('+totp.encryptedSecret +pendingTotp.jtiHash');
  if (!user || !user.isActive || user.sessionVersion !== pending.sv || !user.totp?.enabled || !user.totp.encryptedSecret
    || user.pendingTotp?.jtiHash !== hashToken(pending.jti) || !user.pendingTotp?.expiresAt || user.pendingTotp.expiresAt <= new Date()) throw invalidTotp();

  let valid = false;
  try {
    valid = verifyTotp(decryptSecret(user.totp.encryptedSecret), token);
  } catch (_error) {
    valid = false;
  }
  if (!valid) {
    await bestEffortAudit({
      actor: user.id, actorRole: user.role, action: 'auth.totp.verify', targetType: 'user', targetId: user.id,
      result: 'failure', metadata: requestMetadata(metadata),
    });
    throw invalidTotp();
  }

  return { user: await recordSuccessfulLogin(user, metadata, { pendingTotp: pending }) };
}

async function regenerateRecoveryCodes(user, metadata) {
  const recoveryCodes = generateRecoveryCodes();
  const recoveryCodeHashes = await hashRecoveryCodes(recoveryCodes);
  const session = await mongoose.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      updated = await User.findByIdAndUpdate(user.id || user._id, { $set: { recoveryCodeHashes } }, { new: true, session });
      await auditService.record({
        actor: user.id || user._id, actorRole: user.role, action: 'auth.recovery.regenerate', targetType: 'user', targetId: user.id || user._id,
        result: 'success', metadata: requestMetadata(metadata), session,
      });
    });
    return { user: updated, recoveryCodes };
  } finally {
    await session.endSession();
  }
}

async function recoverWithCode({ email, recoveryCode, newPassword, metadata } = {}) {
  if (!normalizeEmail(email) || !recoveryCode || !validatePassword(newPassword)) {
    await bcrypt.compare(normalizeRecoveryCode(recoveryCode), RECOVERY_DUMMY_HASH);
    await bestEffortAudit({ action: 'auth.recovery.code', targetType: 'user', targetId: 'unknown', result: 'failure', metadata: requestMetadata(metadata) });
    throw invalidRecovery();
  }
  const normalizedCode = normalizeRecoveryCode(recoveryCode);
  const fingerprint = recoveryFingerprint(normalizedCode);
  let user = await User.findOne({
    email: normalizeEmail(email), isActive: true, 'recoveryCodeHashes.fingerprint': fingerprint,
  }).select('+recoveryCodeHashes');
  let matchedEntry = user?.recoveryCodeHashes.find((entry) => entry?.fingerprint === fingerprint);
  let valid = matchedEntry ? await bcrypt.compare(normalizedCode, matchedEntry.bcryptHash) : false;

  // Existing pre-fingerprint records can still be used during migration, but the fallback is deliberately bounded.
  if (!user) {
    const legacyUser = await User.findOne({ email: normalizeEmail(email), isActive: true }).select('+recoveryCodeHashes');
    const legacyHashes = legacyUser?.recoveryCodeHashes.filter((entry) => typeof entry === 'string').slice(0, 8) || [];
    if (legacyHashes.length) {
      for (const legacyHash of legacyHashes) {
        if (await bcrypt.compare(String(recoveryCode).trim(), legacyHash)) {
          user = legacyUser;
          matchedEntry = legacyHash;
          valid = true;
          break;
        }
      }
    } else {
      await bcrypt.compare(normalizedCode, RECOVERY_DUMMY_HASH);
    }
  }
  if (!user || !matchedEntry || !valid) {
    await bestEffortAudit({ action: 'auth.recovery.code', targetType: 'user', targetId: 'unknown', result: 'failure', metadata: requestMetadata(metadata) });
    throw invalidRecovery();
  }

  const passwordHash = await bcrypt.hash(newPassword, HASH_ROUNDS);
  const session = await mongoose.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      updated = await User.findOneAndUpdate(
        { _id: user._id, isActive: true, recoveryCodeHashes: matchedEntry },
        {
          $pull: { recoveryCodeHashes: matchedEntry },
          $set: { password: passwordHash, passwordChangedAt: new Date(), 'pendingTotp.jtiHash': '', 'pendingTotp.expiresAt': null },
          $inc: { sessionVersion: 1 },
        },
        { new: true, session },
      );
      if (!updated) throw invalidRecovery();
      await auditService.record({
        action: 'auth.recovery.code', targetType: 'user', targetId: user.id, result: 'success', metadata: requestMetadata(metadata), session,
      });
    });
    return { user: updated };
  } catch (error) {
    if (error.code === INVALID_RECOVERY) {
      await bestEffortAudit({ action: 'auth.recovery.code', targetType: 'user', targetId: 'unknown', result: 'failure', metadata: requestMetadata(metadata) });
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function issueAssistedReset({ leaderId, pastor, metadata } = {}) {
  const resetCode = crypto.randomBytes(24).toString('base64url');
  const tokenHash = hashToken(resetCode);
  const expiresAt = new Date(Date.now() + assistedResetMinutes() * 60 * 1000);
  const session = await mongoose.startSession();
  try {
    let leader;
    await session.withTransaction(async () => {
      leader = await User.findOneAndUpdate(
        { _id: leaderId, role: 'user', isActive: true },
        { $set: { 'assistedReset.tokenHash': tokenHash, 'assistedReset.expiresAt': expiresAt } },
        { new: true, session },
      );
      if (!leader) throw authError('USER_NOT_FOUND', 404, 'User not found.');
      await auditService.record({
        actor: pastor.id || pastor._id, actorRole: 'pastor', action: 'auth.assisted-reset.issue', targetType: 'user', targetId: leader.id,
        result: 'success', metadata: requestMetadata(metadata), session,
      });
    });
    return { leader, resetCode, expiresAt };
  } finally {
    await session.endSession();
  }
}

async function completeAssistedReset({ email, resetCode, newPassword, metadata } = {}) {
  if (!normalizeEmail(email) || !resetCode || !validatePassword(newPassword)) {
    await bestEffortAudit({ action: 'auth.assisted-reset.complete', targetType: 'user', targetId: 'unknown', result: 'failure', metadata: requestMetadata(metadata) });
    throw invalidRecovery();
  }
  const passwordHash = await bcrypt.hash(newPassword, HASH_ROUNDS);
  const session = await mongoose.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      updated = await User.findOneAndUpdate(
        {
          email: normalizeEmail(email), isActive: true, 'assistedReset.tokenHash': hashToken(resetCode),
          'assistedReset.expiresAt': { $gt: new Date() },
        },
        {
          $set: {
            password: passwordHash, passwordChangedAt: new Date(), 'assistedReset.tokenHash': '', 'assistedReset.expiresAt': null,
            'pendingTotp.jtiHash': '', 'pendingTotp.expiresAt': null,
          },
          $inc: { sessionVersion: 1 },
        },
        { new: true, session },
      );
      if (!updated) throw invalidRecovery();
      await auditService.record({
        action: 'auth.assisted-reset.complete', targetType: 'user', targetId: updated.id,
        result: 'success', metadata: requestMetadata(metadata), session,
      });
    });
    return { user: updated };
  } catch (error) {
    if (error.code === INVALID_RECOVERY) {
      await bestEffortAudit({ action: 'auth.assisted-reset.complete', targetType: 'user', targetId: 'unknown', result: 'failure', metadata: requestMetadata(metadata) });
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function changePassword({ user, currentPassword, newPassword, metadata } = {}) {
  if (!validatePassword(newPassword)) throw authError('PASSWORD_INVALID', 400, 'The new password must contain at least 8 characters.');
  const currentUser = await User.findById(user.id || user._id).select('+password');
  if (!currentUser || !(await currentUser.comparePassword(currentPassword || ''))) {
    await bestEffortAudit({
      actor: user.id || user._id, actorRole: user.role, action: 'auth.password.change', targetType: 'user', targetId: user.id || user._id,
      result: 'failure', metadata: requestMetadata(metadata),
    });
    throw authError('CURRENT_PASSWORD_INVALID', 400, 'Your current password is incorrect.');
  }
  const passwordHash = await bcrypt.hash(newPassword, HASH_ROUNDS);
  const session = await mongoose.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      updated = await User.findByIdAndUpdate(
        currentUser._id,
        {
          $set: { password: passwordHash, passwordChangedAt: new Date(), 'pendingTotp.jtiHash': '', 'pendingTotp.expiresAt': null },
          $inc: { sessionVersion: 1 },
        },
        { new: true, session },
      );
      await auditService.record({
        actor: currentUser.id, actorRole: currentUser.role, action: 'auth.password.change', targetType: 'user', targetId: currentUser.id,
        result: 'success', metadata: requestMetadata(metadata), session,
      });
    });
    return { user: updated };
  } finally {
    await session.endSession();
  }
}

module.exports = {
  INVALID_RECOVERY,
  INVALID_TOTP,
  normalizeEmail,
  validatePassword,
  generateRecoveryCodes,
  hashRecoveryCodes,
  recoveryFingerprint,
  login,
  beginTotpSetup,
  confirmTotpSetup,
  verifyLoginTotp,
  regenerateRecoveryCodes,
  recoverWithCode,
  issueAssistedReset,
  completeAssistedReset,
  changePassword,
};
