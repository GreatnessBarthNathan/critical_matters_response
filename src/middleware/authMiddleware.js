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

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    res.status(401);
    throw new Error('This account is unavailable.');
  }

  req.user = user;
  next();
});

function pastorOnly(req, res, next) {
  if (req.user?.role !== 'pastor') {
    res.status(403);
    return next(new Error('Pastor access is required.'));
  }
  return next();
}

module.exports = { protect, pastorOnly };
