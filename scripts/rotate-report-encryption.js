require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { rotateReportEncryption } = require('../src/utils/migrateReportEncryption');

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required to rotate report encryption.');
  if (!process.env.REPORT_ENCRYPTION_PREVIOUS_KEY) {
    throw new Error('REPORT_ENCRYPTION_PREVIOUS_KEY is required during report-key rotation.');
  }
  await connectDatabase();
  const result = await rotateReportEncryption();
  console.log(`Report encryption rotation complete: ${JSON.stringify(result)}`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Report encryption rotation failed:', error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
