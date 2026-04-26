const dns = require('dns');
// Set DNS servers to bypass potential local DNS issues with SRV records
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

let listenersBound = false;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async () => {
  while (true) {
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

      return mongoose.connection;
    } catch (err) {
      console.error('MongoDB Connection Failed:', err.message);
      await wait(5000);
    }
  }
};

module.exports = connectDB;
