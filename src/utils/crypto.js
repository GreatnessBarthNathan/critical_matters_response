const crypto = require('crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getEncryptionKey() {
  const encodedKey = process.env.TOTP_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error('TOTP_ENCRYPTION_KEY is required for secret encryption');
  }

  const key = Buffer.from(encodedKey, 'base64');
  if (key.toString('base64') !== encodedKey || key.length !== 32) {
    throw new Error('TOTP_ENCRYPTION_KEY must be a canonical Base64 value that decodes to exactly 32 bytes');
  }
  return key;
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((value) => value.toString('base64url')).join('.');
}

function decryptSecret(encryptedValue) {
  if (typeof encryptedValue !== 'string') throw new Error('Encrypted secret must be a string');
  const parts = encryptedValue.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error('Encrypted secret has an invalid format');
  }
  const key = getEncryptionKey();

  try {
    const [iv, authTag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'));
    if (iv.length !== 12 || authTag.length !== 16 || !ciphertext.length) {
      throw new Error('invalid encrypted secret');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (_error) {
    throw new Error('Unable to decrypt secret');
  }
}

module.exports = { hashToken, safeEqual, encryptSecret, decryptSecret };
