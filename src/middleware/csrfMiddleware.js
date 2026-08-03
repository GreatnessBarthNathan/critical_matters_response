const crypto = require('crypto');
const { safeEqual } = require('../utils/crypto');

const CSRF_COOKIE = 'cmr_csrf';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function csrfSecret() {
  if (!process.env.CSRF_SECRET) throw new Error('CSRF_SECRET is required for CSRF protection');
  return process.env.CSRF_SECRET;
}

function signValue(randomValue) {
  return crypto.createHmac('sha256', csrfSecret()).update(randomValue).digest('base64url');
}

function isExempt(req) {
  if (req.method !== 'POST') return false;
  return req.path === '/auth/login'
    || req.path === '/auth/reset-password'
    || /^\/invitations\/[^/]+\/redeem$/.test(req.path);
}

function csrfToken(req, res) {
  const randomValue = crypto.randomBytes(32).toString('base64url');
  const token = `${randomValue}.${signValue(randomValue)}`;
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.json({ csrfToken: token });
}

function csrfProtection(req, res, next) {
  if (!MUTATING_METHODS.has(req.method) || isExempt(req)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get('X-CSRF-Token');
  if (!safeEqual(cookieToken, headerToken)) {
    return res.status(403).json({ message: 'A valid CSRF token is required.' });
  }

  const [randomValue, signature, ...extra] = cookieToken.split('.');
  if (!randomValue || !signature || extra.length || !safeEqual(signature, signValue(randomValue))) {
    return res.status(403).json({ message: 'A valid CSRF token is required.' });
  }
  return next();
}

module.exports = { csrfToken, csrfProtection };
