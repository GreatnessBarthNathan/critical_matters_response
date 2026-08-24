const crypto = require('crypto');

const PREFIX = 'cmr-report-v1';

function decodeKey(name, value) {
  if (!value) throw new Error(`${name} is required for report encryption`);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value || decoded.length !== 32) {
    throw new Error(`${name} must be canonical Base64 and decode to exactly 32 bytes`);
  }
  return decoded;
}

function currentKey() {
  return decodeKey('REPORT_ENCRYPTION_KEY', process.env.REPORT_ENCRYPTION_KEY);
}

function previousKey() {
  return process.env.REPORT_ENCRYPTION_PREVIOUS_KEY
    ? decodeKey('REPORT_ENCRYPTION_PREVIOUS_KEY', process.env.REPORT_ENCRYPTION_PREVIOUS_KEY)
    : null;
}

function encryptReportValue(value) {
  if (typeof value !== 'string') throw new Error('Report encryption requires text');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', currentKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, 'current', iv, tag, ciphertext]
    .map((part) => (Buffer.isBuffer(part) ? part.toString('base64url') : part))
    .join('.');
}

function isEncryptedReportValue(value) {
  return typeof value === 'string' && value.startsWith(`${PREFIX}.`);
}

function parseEnvelope(value) {
  if (!isEncryptedReportValue(value)) throw new Error('Report value is not encrypted');
  const parts = value.split('.');
  if (parts.length !== 5 || parts[0] !== PREFIX || !['current', 'previous'].includes(parts[1])) {
    throw new Error('Report encryption envelope is invalid');
  }
  const [iv, tag, data] = parts.slice(2).map((part) => Buffer.from(part, 'base64url'));
  if (iv.length !== 12 || tag.length !== 16 || !data.length) throw new Error('Report encryption envelope is invalid');
  return { keyId: parts[1], iv, tag, data };
}

function decryptReportValue(value) {
  const { keyId, iv, tag, data } = parseEnvelope(value);
  const key = keyId === 'previous' ? previousKey() : currentKey();
  if (!key) throw new Error('Report encryption key is unavailable');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (_error) {
    throw new Error('Unable to decrypt report value');
  }
}

function decryptLegacyOrEncryptedValue(value) {
  return isEncryptedReportValue(value) ? decryptReportValue(value) : value;
}

module.exports = {
  PREFIX,
  encryptReportValue,
  decryptReportValue,
  decryptLegacyOrEncryptedValue,
  isEncryptedReportValue,
};
