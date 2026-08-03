const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-that-is-long-enough-to-be-safe';
process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret-that-is-long-enough-to-be-safe';
process.env.TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
process.env.RECOVERY_CODE_PEPPER = process.env.RECOVERY_CODE_PEPPER || 'test-recovery-code-pepper-that-is-long-enough';

// Each test gets its own replica set so nothing leaks between tests and the process exits cleanly
// once the file's tests finish.
async function createTestApp(t, appOptions = {}) {
  const mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  // Unique indexes must exist before a test can rely on them to reject a concurrent write.
  await require('../../src/config/database').ensureIndexes();
  const createApp = require('../../app');

  t.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  return createApp(appOptions);
}

module.exports = { createTestApp };
