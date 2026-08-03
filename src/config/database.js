const mongoose = require('mongoose');

// Every model whose indexes enforce a rule, not just performance.
const INDEXED_MODELS = ['User', 'Report', 'Invitation', 'AuditEvent'];

async function assertTransactionTopology(connection, env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const topology = await connection.connection.db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== 'isdbgrid') {
    throw new Error('MongoDB transactions require a replica set or sharded cluster in production. Use MongoDB Atlas or configure a replica set.');
  }
}

/**
 * Mongoose builds indexes in the background, so a freshly created database can briefly accept
 * writes that a unique index would later refuse — for example two active invitations for the same
 * address. Wait for the builds to finish before serving traffic.
 */
async function ensureIndexes() {
  require('../models/User');
  require('../models/Report');
  require('../models/Invitation');
  require('../models/AuditEvent');

  await Promise.all(INDEXED_MODELS.map((name) => mongoose.model(name).init()));
}

async function connectDatabase() {
  mongoose.set('strictQuery', true);
  const connection = await mongoose.connect(process.env.MONGODB_URI);
  await assertTransactionTopology(connection);
  await ensureIndexes();
  console.log(`MongoDB connected: ${connection.connection.host}`);
  return connection;
}

module.exports = connectDatabase;
module.exports.assertTransactionTopology = assertTransactionTopology;
module.exports.ensureIndexes = ensureIndexes;
