require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { verifyReportEncryption } = require('../src/utils/migrateReportEncryption');

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required to verify report encryption.');
  await connectDatabase();
  const result = await verifyReportEncryption();
  console.log(`Report encryption verification: ${JSON.stringify(result)}`);
  await mongoose.disconnect();
  if (result.invalidFields) process.exitCode = 1;
}

run().catch(async (error) => {
  console.error('Report encryption verification failed:', error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
