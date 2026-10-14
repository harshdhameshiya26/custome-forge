/* eslint-env node */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './app.js';
import connectDB from './config/db.js';
import Design from './models/design.model.js';
import DesignRevision from './models/design-revision.model.js';
import DesignFeedback from './models/design-feedback.model.js';
import GuestSession from './models/guest-session.model.js';
import { logSuccess, logError, logWarn } from './utils/logger.js';

// Resolve current directory and load environment variables from backend/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

// Load backend/.env specifically for backend configuration
const envConfig = dotenv.config({ path: envPath });
dotenv.config();

const PORT = process.env.PORT || envConfig.parsed?.PORT || 5000;

/**
 * Bootstrap function to initialize DB connection and start Express HTTP server.
 */
const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Ensure required uniqueness and guest-session expiry indexes exist.
    await Promise.all([
      Design.createIndexes(),
      DesignRevision.createIndexes(),
      DesignFeedback.createIndexes(),
      GuestSession.createIndexes(),
    ]);

    // 3. Start HTTP Listener
    const server = app.listen(PORT, () => {
      logSuccess(`🌐 Server running on port ${PORT}`);
    });

    // 4. Graceful shutdown handler
    const handleShutdown = (signal) => {
      logWarn(`⚠️ Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        logSuccess('🛑 Server stopped');
        process.exit(0);
      });

      setTimeout(() => {
        logError('❌ Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    process.on('unhandledRejection', (reason) => {
      logError(`❌ Unhandled Rejection: ${reason}`);
    });

    process.on('uncaughtException', (error) => {
      logError(`❌ Uncaught Exception: ${error.message}`);
      process.exit(1);
    });
  } catch (error) {
    logError(`❌ Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
