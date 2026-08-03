const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Invitation = require('../models/Invitation');
const User = require('../models/User');
const auditService = require('./auditService');
const { hashToken } = require('../utils/crypto');
const generateRecoveryKey = require('../utils/recoveryKey');

const INVALID_INVITATION = 'INVALID_INVITATION';
const DEFAULT_TTL_DAYS = 7;

function invalidInvitation() {
  const error = new Error(INVALID_INVITATION);
  error.code = INVALID_INVITATION;
  error.status = 400;
  return error;
}

function invitationConflict() {
  const error = new Error('An active invitation already exists. Please retry.');
  error.code = 'INVITATION_CONFLICT';
  error.status = 409;
  return error;
}

function invitationInactive() {
  const error = new Error('Invitation is no longer active.');
  error.code = 'INVITATION_INACTIVE';
  error.status = 409;
  return error;
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateNames(firstName, lastName) {
  return typeof firstName === 'string' && firstName.trim().length > 0 && firstName.trim().length <= 50
    && typeof lastName === 'string' && lastName.trim().length > 0 && lastName.trim().length <= 50;
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function invitationTtlDays() {
  const value = Number(process.env.INVITATION_TTL_DAYS || DEFAULT_TTL_DAYS);
  return Number.isInteger(value) && value > 0 && value <= 90 ? value : DEFAULT_TTL_DAYS;
}

function generateInvitationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateRecoveryCodes() {
  return Array.from({ length: 8 }, () => crypto.randomBytes(9).toString('base64url').toUpperCase());
}

function safeMetadata(ip, userAgent) {
  return { ip: ip || '', userAgent: userAgent || '' };
}

function isActive(invitation, now = new Date()) {
  return Boolean(invitation) && !invitation.consumedAt && !invitation.revokedAt && invitation.expiresAt > now;
}

function maskedEmail(email) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

async function createInvitation({ email, pastor, ip, userAgent }) {
  const normalizedEmail = normalizeEmail(email);
  if (!validateEmail(normalizedEmail)) {
    const error = new Error('A valid email address is required.');
    error.status = 400;
    throw error;
  }

  const now = new Date();
  const replacedInvitations = await Invitation.find({
    email: normalizedEmail, active: true, consumedAt: null, revokedAt: null, expiresAt: { $gt: now },
  }).select('_id');
  await Invitation.updateMany(
    { email: normalizedEmail, active: true, consumedAt: null, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { active: false, revokedAt: now } },
  );
  await Invitation.updateMany(
    { email: normalizedEmail, active: true, expiresAt: { $lte: now } },
    { $set: { active: false } },
  );
  await Promise.all(replacedInvitations.map((replaced) => auditService.record({
    actor: pastor._id || pastor.id,
    actorRole: 'pastor',
    action: 'invitation.revoke',
    targetType: 'invitation',
    targetId: replaced.id,
    result: 'success',
    metadata: safeMetadata(ip, userAgent),
  })));
  const plainToken = generateInvitationToken();
  let invitation;
  try {
    invitation = await Invitation.create({
      email: normalizedEmail,
      tokenHash: hashToken(plainToken),
      createdBy: pastor._id || pastor.id,
      expiresAt: new Date(now.getTime() + invitationTtlDays() * 24 * 60 * 60 * 1000),
      active: true,
    });
  } catch (error) {
    if (error.code === 11000) throw invitationConflict();
    throw error;
  }
  await auditService.record({
    actor: pastor._id || pastor.id,
    actorRole: 'pastor',
    action: 'invitation.create',
    targetType: 'invitation',
    targetId: invitation.id,
    result: 'success',
    metadata: safeMetadata(ip, userAgent),
  });
  return { invitation, plainToken };
}

async function listInvitations({ page = 1, limit = 20 } = {}) {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);
  const safePage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
  const [invitations, total] = await Promise.all([
    Invitation.find().sort({ createdAt: -1, _id: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit),
    Invitation.countDocuments(),
  ]);
  return {
    invitations,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
      hasNextPage: safePage * safeLimit < total,
    },
  };
}

async function revokeInvitation({ invitationId, pastor, ip, userAgent }) {
  const invitation = await Invitation.findOneAndUpdate(
    { _id: invitationId, active: true, consumedAt: null, revokedAt: null },
    { $set: { active: false, revokedAt: new Date() } },
    { new: true },
  );
  if (!invitation) {
    if (await Invitation.exists({ _id: invitationId })) throw invitationInactive();
    const error = new Error('Invitation not found.');
    error.status = 404;
    throw error;
  }
  await auditService.record({
    actor: pastor._id || pastor.id,
    actorRole: 'pastor',
    action: 'invitation.revoke',
    targetType: 'invitation',
    targetId: invitation.id,
    result: 'success',
    metadata: safeMetadata(ip, userAgent),
  });
  return invitation;
}

async function lookupActiveInvitation(plainToken) {
  if (typeof plainToken !== 'string' || !plainToken || plainToken.length > 512) return null;
  const invitation = await Invitation.findOne({ tokenHash: hashToken(plainToken), active: true }).select('+tokenHash');
  return isActive(invitation) ? invitation : null;
}

async function inspectInvitation(plainToken) {
  const invitation = await lookupActiveInvitation(plainToken);
  if (!invitation) throw invalidInvitation();
  return { email: maskedEmail(invitation.email), expiresAt: invitation.expiresAt };
}

async function recordRedeemFailure(plainToken, ip, userAgent) {
  await auditService.record({
    action: 'invitation.redeem',
    targetType: 'invitation',
    targetId: hashToken(plainToken).slice(0, 32),
    result: 'failure',
    metadata: safeMetadata(ip, userAgent),
  });
}

async function redeemInvitation({ plainToken, firstName, lastName, password, email, ip, userAgent }) {
  if (!validateNames(firstName, lastName) || !validatePassword(password)) {
    await recordRedeemFailure(plainToken, ip, userAgent);
    throw invalidInvitation();
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const now = new Date();
      const invitation = await Invitation.findOneAndUpdate(
        { tokenHash: hashToken(plainToken), active: true, consumedAt: null, revokedAt: null, expiresAt: { $gt: now } },
        { $set: { active: false, consumedAt: now } },
        { new: true, session },
      ).select('+tokenHash');
      if (!invitation) throw invalidInvitation();
      if (email !== undefined && normalizeEmail(email) !== invitation.email) throw invalidInvitation();

      if (await User.exists({ email: invitation.email }).session(session)) {
        throw invalidInvitation();
      }
      const recoveryCodes = generateRecoveryCodes();
      const recoveryCodeHashes = await Promise.all(recoveryCodes.map((code) => bcrypt.hash(code, 12)));
      const user = await User.create([{
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: invitation.email,
        password,
        role: 'user',
        recoveryCodeHashes,
        recoveryKeyHash: generateRecoveryKey(),
      }], { session });
      await auditService.record({
        action: 'invitation.redeem',
        targetType: 'invitation',
        targetId: invitation.id,
        result: 'success',
        metadata: safeMetadata(ip, userAgent),
        session,
      });
      result = { user: user[0], recoveryCodes, invitationId: invitation.id };
    });
    return result;
  } catch (error) {
    if (error.code === 11000 || error.code === INVALID_INVITATION) {
      await recordRedeemFailure(plainToken, ip, userAgent);
      throw invalidInvitation();
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  INVALID_INVITATION,
  createInvitation,
  listInvitations,
  revokeInvitation,
  inspectInvitation,
  redeemInvitation,
  normalizeEmail,
};
