require('dotenv').config();

const createApp = require('./app');
const { getConfig } = require('./src/config/env');
const connectDatabase = require('./src/config/database');
const seedAdmin = require('./src/utils/seedAdmin');
const seedTechSupport = require('./src/utils/seedTechSupport');

function normalizeBootstrapEmail(value) {
  return value?.trim().toLowerCase();
}

function validateBootstrapAccounts(env = process.env) {
  const adminEmail = normalizeBootstrapEmail(env.ADMIN_EMAIL);
  const supportEmail = normalizeBootstrapEmail(env.TECH_SUPPORT_EMAIL);
  if (adminEmail && supportEmail && adminEmail === supportEmail) {
    throw new Error('ADMIN_EMAIL and TECH_SUPPORT_EMAIL must be different addresses.');
  }
}

async function start() {
  const config = getConfig();
  validateBootstrapAccounts();
  await connectDatabase();
  await seedAdmin();
  await seedTechSupport();
  createApp({ trustProxyHops: config.trustProxyHops }).listen(
    config.port,
    () => console.log(`Critical Matters Response is running on port ${config.port}`),
  );
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Application failed to start:', error.message);
    process.exit(1);
  });
}

module.exports = { start, validateBootstrapAccounts };
