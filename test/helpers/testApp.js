const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-that-is-long-enough-to-be-safe';
process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret-that-is-long-enough-to-be-safe';
process.env.TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');

async function createTestApp(t) {
  const mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  const createApp = require('../../app');

  t.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  return createApp();
}

module.exports = { createTestApp };
