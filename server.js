require('dotenv').config();

const createApp = require('./app');
const { getConfig } = require('./src/config/env');
const connectDatabase = require('./src/config/database');
const seedAdmin = require('./src/utils/seedAdmin');

async function start() {
  const config = getConfig();
  await connectDatabase();
  await seedAdmin();
  createApp({ trustProxyHops: config.trustProxyHops }).listen(
    config.port,
    () => console.log(`Critical Matters Response is running on port ${config.port}`),
  );
}

start().catch((error) => {
  console.error('Application failed to start:', error.message);
  process.exit(1);
});
