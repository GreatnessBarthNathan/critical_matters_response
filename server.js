require('dotenv').config();

const createApp = require('./app');
const { getConfig } = require('./src/config/env');
const connectDatabase = require('./src/config/database');
const seedPastor = require('./src/utils/seedPastor');

async function start() {
  const config = getConfig();
  await connectDatabase();
  await seedPastor();
  createApp().listen(config.port, () => console.log(`Critical Matters Response is running on port ${config.port}`));
}

start().catch((error) => {
  console.error('Application failed to start:', error.message);
  process.exit(1);
});
