const asyncHandler = require('../utils/asyncHandler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auditService = require('../services/auditService');
const {
  signToken,
  setAuthCookie,
  setPendingTotpCookie,
  setTotpSetupCookie,
  clearAuthCookie,
  clearPendingTotpCookie,
  clearTotpSetupCookie,
} = require('../utils/authToken');
const authService = require('../services/authService');

function requestMetadata(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

exports.login = asyncHandler(async (req, res) => {
  const result = await authService.login({ ...req.body, metadata: requestMetadata(req) });
  if (result.requiresTotp) {
    setPendingTotpCookie(res, result.pendingToken);
    return res.json({ requiresTotp: true, message: 'Enter the code from your authenticator app.' });
  }
  setAuthCookie(res, signToken(result.user));
  return res.json({ user: result.user.toSafeObject(), message: 'Welcome back.' });
});

exports.logout = asyncHandler(async (req, res) => {
  try {
    const payload = jwt.verify(req.cookies.cmr_token, process.env.JWT_SECRET);
    if (!payload.purpose && payload.sub && Number.isInteger(payload.sv)) {
      const user = await User.findById(payload.sub);
      if (user && user.isActive && user.sessionVersion === payload.sv) {
        await auditService.record({
          actor: user.id, actorRole: user.role, action: 'auth.logout', targetType: 'user', targetId: user.id,
          result: 'success', metadata: requestMetadata(req),
        });
      }
    }
  } catch (_error) {
    // Logging or token validation must never keep client cookies alive.
  }
  clearAuthCookie(res);
  clearPendingTotpCookie(res);
  clearTotpSetupCookie(res);
  res.json({ message: 'You have been signed out.' });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

exports.beginTotpSetup = asyncHandler(async (req, res) => {
  const result = await authService.beginTotpSetup(req.user);
  setTotpSetupCookie(res, result.setupToken);
  res.json({ otpauthUrl: result.otpauthUrl, qrDataUrl: result.qrDataUrl });
});

exports.confirmTotpSetup = asyncHandler(async (req, res) => {
  const result = await authService.confirmTotpSetup(req.user, req.body.token, req.cookies.cmr_totp_setup, requestMetadata(req));
  clearTotpSetupCookie(res);
  res.json({
    user: result.user.toSafeObject(),
    recoveryCodes: result.recoveryCodes,
    message: 'Two-factor authentication is enabled. Save your recovery codes; they will not be shown again.',
  });
});

exports.verifyLoginTotp = asyncHandler(async (req, res) => {
  const result = await authService.verifyLoginTotp({
    pendingToken: req.cookies.cmr_totp_pending,
    token: req.body.token,
    metadata: requestMetadata(req),
  });
  clearPendingTotpCookie(res);
  setAuthCookie(res, signToken(result.user));
  res.json({ user: result.user.toSafeObject(), message: 'Welcome back.' });
});

exports.regenerateRecoveryCodes = asyncHandler(async (req, res) => {
  const result = await authService.regenerateRecoveryCodes(req.user, requestMetadata(req));
  res.json({ recoveryCodes: result.recoveryCodes, message: 'New recovery codes generated. Previous codes no longer work.' });
});

exports.recoverWithCode = asyncHandler(async (req, res) => {
  await authService.recoverWithCode({ ...req.body, metadata: requestMetadata(req) });
  res.json({ message: 'Password reset successfully. You can now sign in.' });
});

exports.completeAssistedReset = asyncHandler(async (req, res) => {
  await authService.completeAssistedReset({ ...req.body, metadata: requestMetadata(req) });
  res.json({ message: 'Password reset successfully. You can now sign in.' });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword({ ...req.body, user: req.user, metadata: requestMetadata(req) });
  setAuthCookie(res, signToken(result.user));
  res.json({ user: result.user.toSafeObject(), message: 'Password changed successfully.' });
});
