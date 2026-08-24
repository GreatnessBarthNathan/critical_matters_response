require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { migrateRolesAndCategories } = require('../src/utils/migrateRolesAndCategories');

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required to run this migration.');
  await connectDatabase();
  const result = await migrateRolesAndCategories();
  console.log(`Migration complete: ${JSON.stringify(result)}`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Migration failed:', error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
