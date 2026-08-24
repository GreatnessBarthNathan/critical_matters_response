function isPlaceholderSecret(value) {
  return /\b(?:change|replace|placeholder|example|default)\b/i.test(value)
    || /^(?:your|test)[-_ ]?(?:jwt|csrf|secret|key)/i.test(value);
}

function validateSecret(name, value) {
  if (Buffer.byteLength(value, 'utf8') < 32 || isPlaceholderSecret(value)) {
    throw new Error(`${name} must be at least 32 bytes and not use a placeholder value`);
  }
}

function decodeTotpEncryptionKey(value) {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error('TOTP_ENCRYPTION_KEY must be strict canonical Base64');
  }
  if (decoded.length !== 32) {
    throw new Error('TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
}

function decodeReportEncryptionKey(name, value) {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error(`${name} must be strict canonical Base64`);
  }
  if (decoded.length !== 32) {
    throw new Error(`${name} must decode to exactly 32 bytes`);
  }
}

function validateRecoveryPeppers(env) {
  validateSecret('RECOVERY_CODE_PEPPER', env.RECOVERY_CODE_PEPPER);
  if (!env.RECOVERY_CODE_PREVIOUS_PEPPERS) return;
  for (const pepper of env.RECOVERY_CODE_PREVIOUS_PEPPERS.split(',').map((value) => value.trim()).filter(Boolean)) {
    validateSecret('RECOVERY_CODE_PREVIOUS_PEPPERS entry', pepper);
  }
}

function parseTrustProxyHops(value) {
  if (value === undefined || value === '') return 0;
  if (!/^(?:0|[1-9]\d?)$/.test(String(value)) || Number(value) > 10) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  }
  return Number(value);
}

function getConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const required = ['MONGODB_URI', 'JWT_SECRET'];
  if (production) required.push('CSRF_SECRET', 'TOTP_ENCRYPTION_KEY', 'RECOVERY_CODE_PEPPER', 'REPORT_ENCRYPTION_KEY');
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing required environment values: ${missing.join(', ')}`);
  if (production) {
    validateSecret('JWT_SECRET', env.JWT_SECRET);
    validateSecret('CSRF_SECRET', env.CSRF_SECRET);
    decodeTotpEncryptionKey(env.TOTP_ENCRYPTION_KEY);
    decodeReportEncryptionKey('REPORT_ENCRYPTION_KEY', env.REPORT_ENCRYPTION_KEY);
    if (env.REPORT_ENCRYPTION_PREVIOUS_KEY) {
      decodeReportEncryptionKey('REPORT_ENCRYPTION_PREVIOUS_KEY', env.REPORT_ENCRYPTION_PREVIOUS_KEY);
    }
    validateRecoveryPeppers(env);
  }

  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return { production, port, mongodbUri: env.MONGODB_URI, trustProxyHops: parseTrustProxyHops(env.TRUST_PROXY_HOPS) };
}

module.exports = { getConfig, parseTrustProxyHops, validateRecoveryPeppers, decodeReportEncryptionKey };
