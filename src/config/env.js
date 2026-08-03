function getConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const required = ['MONGODB_URI', 'JWT_SECRET'];
  if (production) required.push('CSRF_SECRET', 'TOTP_ENCRYPTION_KEY');
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing required environment values: ${missing.join(', ')}`);
  if (production && Buffer.from(env.TOTP_ENCRYPTION_KEY, 'base64').length !== 32) throw new Error('TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return { production, port: Number(env.PORT || 5000), mongodbUri: env.MONGODB_URI };
}

module.exports = { getConfig };
