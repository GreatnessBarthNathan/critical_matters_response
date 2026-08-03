const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign({ sub: user.id || user._id, sv: user.sessionVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function setAuthCookie(res, token) {
  res.cookie('cmr_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

module.exports = { signToken, setAuthCookie };
