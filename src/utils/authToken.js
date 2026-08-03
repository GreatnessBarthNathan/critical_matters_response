const jwt = require('jsonwebtoken');

const DEFAULT_SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const EXPIRY_UNITS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };

function sessionDuration(value = process.env.JWT_EXPIRES_IN) {
  const match = typeof value === 'string' && /^(\d+)([smhd])$/i.exec(value.trim());
  if (!match) return { expiresIn: '7d', maxAge: DEFAULT_SESSION_MAX_AGE };

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const maxAge = amount * EXPIRY_UNITS[unit];
  if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isSafeInteger(maxAge)) {
    return { expiresIn: '7d', maxAge: DEFAULT_SESSION_MAX_AGE };
  }
  return { expiresIn: `${amount}${unit}`, maxAge };
}

function signToken(user) {
  const { expiresIn } = sessionDuration();
  return jwt.sign({ sub: user.id || user._id, sv: user.sessionVersion }, process.env.JWT_SECRET, {
    expiresIn,
  });
}

function signPurposeToken(payload, expiresIn = '5m') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(maxAge && { maxAge }),
    path: '/',
  };
}

function setAuthCookie(res, token) {
  const { maxAge } = sessionDuration();
  res.cookie('cmr_token', token, cookieOptions(maxAge));
}

function setPendingTotpCookie(res, token) {
  res.cookie('cmr_totp_pending', token, cookieOptions(5 * 60 * 1000));
}

function setTotpSetupCookie(res, token) {
  res.cookie('cmr_totp_setup', token, cookieOptions(5 * 60 * 1000));
}

function clearAuthCookie(res) {
  res.clearCookie('cmr_token', cookieOptions());
}

function clearPendingTotpCookie(res) {
  res.clearCookie('cmr_totp_pending', cookieOptions());
}

function clearTotpSetupCookie(res) {
  res.clearCookie('cmr_totp_setup', cookieOptions());
}

module.exports = {
  signToken,
  signPurposeToken,
  setAuthCookie,
  setPendingTotpCookie,
  setTotpSetupCookie,
  clearAuthCookie,
  clearPendingTotpCookie,
  clearTotpSetupCookie,
};
