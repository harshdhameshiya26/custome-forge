/* eslint-env node */

import dotenv from 'dotenv';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import app from './app.js';
import connectDB from './config/db.js';
import Design from './models/design.model.js';
import DesignRevision from './models/design-revision.model.js';
import DesignFeedback from './models/design-feedback.model.js';
import GuestSession from './models/guest-session.model.js';
import DesignLibraryItem from './models/design-library-item.model.js';
import MerchantSettings from './models/merchant-settings.model.js';
import { logSuccess, logError, logWarn } from './utils/logger.js';
import freePort from './utils/free-port.js';

// Resolve current directory and load environment variables from backend/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

// Load backend/.env specifically for backend configuration
const envConfig = dotenv.config({ path: envPath });
dotenv.config();

const PORT = Number(process.env.PORT || envConfig.parsed?.PORT || 5000);

/**
 * Bootstrap function to initialize DB connection and start Express HTTP server.
 * Automatically clears any lingering process holding the port before listening.
 */
const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Ensure required uniqueness and indexes exist for all models
    await Promise.all([
      Design.createIndexes(),
      DesignRevision.createIndexes(),
      DesignFeedback.createIndexes(),
      GuestSession.createIndexes(),
      DesignLibraryItem.createIndexes(),
      MerchantSettings.createIndexes(),
    ]);

    // 3. Proactively ensure port is available
    freePort(PORT);

    // 4. Start HTTP Listener (with auto-retry on EADDRINUSE)
    const server = app.listen(PORT);

    server.on('listening', () => {
      logSuccess(`🌐 Server running on port ${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logWarn(`⚠️  Port ${PORT} is in use. Attempting to free it...`);
        server.close();

        // Kill the blocking process and retry once after a short delay
        freePort(PORT);

        setTimeout(() => {
          logWarn(`🔄 Retrying to listen on port ${PORT}...`);
          server.listen(PORT);
        }, 1000);
      } else {
        logError(`❌ Server error: ${err.message}`);
        process.exit(1);
      }
    });

    // 4. Graceful shutdown handlers
    const handleShutdown = (signal) => {
      logWarn(`⚠️  Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        logSuccess('🛑 Server stopped');
        process.exit(0);
      });

      // Force-exit if close takes longer than 10 s
      setTimeout(() => {
        logError('❌ Forcing shutdown after timeout');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGINT',  () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    process.on('unhandledRejection', (reason) => {
      logError(`❌ Unhandled Rejection: ${reason}`);
    });

    process.on('uncaughtException', (error) => {
      // Ignore EADDRINUSE here — handled by server.on('error') above
      if (error.code !== 'EADDRINUSE') {
        logError(`❌ Uncaught Exception: ${error.message}`);
        process.exit(1);
      }
    });

  } catch (error) {
    logError(`❌ Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();

