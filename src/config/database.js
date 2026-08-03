const mongoose = require('mongoose');

async function connectDatabase() {
  mongoose.set('strictQuery', true);
  const connection = await mongoose.connect(process.env.MONGODB_URI);
  console.log(`MongoDB connected: ${connection.connection.host}`);
  return connection;
}

module.exports = connectDatabase;
