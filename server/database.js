const dns = require('dns');
// Set DNS servers to bypass potential local DNS issues with SRV records
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

let listenersBound = false;

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
      minPoolSize: 2,
      retryWrites: true,
      autoIndex: true
    });
    console.log('MongoDB Atlas Connected Successfully');

    if (!listenersBound) {
      listenersBound = true;
      mongoose.connection.on('error', (err) => {
        console.error('[MONGO CONNECTION ERROR]', err?.message || err);
      });
      mongoose.connection.on('disconnected', () => {
        console.warn('[MONGO] Disconnected from Atlas');
      });
      mongoose.connection.on('reconnected', () => {
        console.log('[MONGO] Reconnected to Atlas');
      });
    }

  } catch (err) {
    console.error('MongoDB Connection Failed:', err.message);
    // Keep server alive and retry shortly to avoid client-wide ECONNREFUSED storms.
    setTimeout(() => {
      connectDB().catch(() => {});
    }, 5000);
  }
};

module.exports = connectDB;
