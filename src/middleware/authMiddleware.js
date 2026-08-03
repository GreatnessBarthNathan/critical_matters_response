const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

const protect = asyncHandler(async (req, res, next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;
  const token = req.cookies.cmr_token || bearer;

  if (!token) {
    res.status(401);
    throw new Error('Please sign in to continue.');
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_error) {
    res.status(401);
    throw new Error('Your session has expired. Please sign in again.');
  }

  if (payload.purpose || !payload.sub || !Number.isInteger(payload.sv)) {
    res.status(401);
    throw new Error('Your session is not valid for this request.');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    res.status(401);
    throw new Error('This account is unavailable.');
  }
  if (payload.sv !== user.sessionVersion) {
    res.status(401);
    throw new Error('Your session has been revoked. Please sign in again.');
  }

  req.user = user;
  next();
});

function pastorOnly(req, res, next) {
  if (req.user?.role !== 'pastor') {
    const error = new Error('Pastor access is required.');
    error.code = 'FORBIDDEN';
    error.status = 403;
    return next(error);
  }
  return next();
}

function requirePastorTotp(req, res, next) {
  if (req.user?.role === 'pastor' && !req.user.totp?.enabled) {
    const error = new Error('Pastor two-factor authentication setup is required.');
    error.code = 'PASTOR_TOTP_REQUIRED';
    error.status = 403;
    return next(error);
  }
  return next();
}

module.exports = { protect, pastorOnly, requirePastorTotp };
