require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { migrateReportEncryption } = require('../src/utils/migrateReportEncryption');

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required to run this migration.');
  await connectDatabase();
  const result = await migrateReportEncryption({ dryRun: process.argv.includes('--dry-run') });
  console.log(`Report encryption migration complete: ${JSON.stringify(result)}`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Report encryption migration failed:', error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
