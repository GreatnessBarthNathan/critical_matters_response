const mongoose = require('mongoose');

async function assertTransactionTopology(connection, env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const topology = await connection.connection.db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== 'isdbgrid') {
    throw new Error('MongoDB transactions require a replica set or sharded cluster in production. Use MongoDB Atlas or configure a replica set.');
  }
}

async function connectDatabase() {
  mongoose.set('strictQuery', true);
  const connection = await mongoose.connect(process.env.MONGODB_URI);
  await assertTransactionTopology(connection);
  console.log(`MongoDB connected: ${connection.connection.host}`);
  return connection;
}

module.exports = connectDatabase;
module.exports.assertTransactionTopology = assertTransactionTopology;
