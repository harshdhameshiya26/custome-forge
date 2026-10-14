import mongoose from 'mongoose';
import { logSuccess, logError, logWarn } from '../utils/logger.js';

/**
 * Establish a connection to MongoDB using Mongoose.
 * Logs concise green success and red error messages.
 *
 * @returns {Promise<mongoose.Connection>} Active Mongoose connection instance
 */
export const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    const errorMsg = 'MONGODB_URI is not defined in environment variables.';
    logError(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }

  mongoose.connection.on('error', (err) => {
    logError(`❌ MongoDB connection error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    logWarn('⚠️ MongoDB connection lost. Attempting reconnect...');
  });

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: process.env.NODE_ENV !== 'production',
    });

    logSuccess('🚀 MongoDB connected');
    return conn.connection;
  } catch (error) {
    logError(`❌ MongoDB connection failed: ${error.message}`);
    throw error;
  }
};

export default connectDB;
