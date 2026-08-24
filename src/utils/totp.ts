const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const ISSUER = 'Critical Matters Response';

function createTotpSetup(email) {
  const secret = authenticator.generateSecret();
  return {
    secret,
    otpauthUrl: authenticator.keyuri(String(email).trim(), ISSUER, secret),
  };
}

function verifyTotp(secret, token) {
  try {
    return authenticator.verify({ secret, token: String(token || '').trim() });
  } catch (_error) {
    return false;
  }
}

function toQrDataUrl(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl);
}

module.exports = { createTotpSetup, verifyTotp, toQrDataUrl };
