const crypto = require('crypto');

function generateRecoveryKey() {
  const raw = crypto.randomBytes(9).toString('base64url').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

module.exports = generateRecoveryKey;
