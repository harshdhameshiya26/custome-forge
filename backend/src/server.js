/* eslint-env node */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import Design from './models/design.model.js';
import DesignRevision from './models/design-revision.model.js';
import DesignFeedback from './models/design-feedback.model.js';
import GuestSession from './models/guest-session.model.js';
import DesignLibraryItem from './models/design-library-item.model.js';
import MerchantSettings from './models/merchant-settings.model.js';
import Proof from './models/proof.model.js';
import Comment from './models/comment.model.js';
import PrintFile from './models/print-file.model.js';
import RoutingRule from './models/routing-rule.model.js';
import CustomOrder from './models/custom-order.model.js';
import Subscription from './models/subscription.model.js';
import User from './models/user.model.js';
import Schedule from './models/schedule.model.js';
import ScheduleService from './services/scheduleService.js';
import ActionOtp from './models/action-otp.model.js';
import ArtworkCheck from './models/artwork-check.model.js';
import CustomOrderTimeline from './models/custom-order-timeline.model.js';
import FeasibilityCheck from './models/feasibility-check.model.js';
import Notification from './models/notification.model.js';
import ProductCustomizationConfig from './models/product-customization-config.model.js';
import ProductManufacturingConstraint from './models/product-manufacturing-constraint.model.js';
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
    const dbConn = await connectDB();

    // 2. Ensure all 21 models have collections created and required uniqueness/indexes pushed to MongoDB
    const models = [
      Design,
      DesignRevision,
      DesignFeedback,
      GuestSession,
      DesignLibraryItem,
      MerchantSettings,
      Proof,
      Comment,
      PrintFile,
      RoutingRule,
      CustomOrder,
      Subscription,
      User,
      Schedule,
      ActionOtp,
      ArtworkCheck,
      CustomOrderTimeline,
      FeasibilityCheck,
      Notification,
      ProductCustomizationConfig,
      ProductManufacturingConstraint,
    ];

    // Use the connection object returned by connectDB() to avoid relying on the
    // mongoose singleton state which may be stale during --watch hot-restarts.
    const db = (dbConn && dbConn.db) ? dbConn.db : mongoose.connection.db;
    const existingCollections = await db.listCollections().toArray();
    const existingNames = new Set(existingCollections.map((c) => c.name));

    for (const m of models) {
      const colName = m.collection.name;
      if (!existingNames.has(colName)) {
        await db.createCollection(colName).catch(() => {});
      }
      await m.createIndexes().catch(() => {});
    }

    let dispatchingScheduledEmails = false;
    const dispatchDueScheduledEmails = async () => {
      if (dispatchingScheduledEmails) return;
      dispatchingScheduledEmails = true;
      try {
        await ScheduleService.dispatchDueSupplierScheduleEmails();
      } catch (error) {
        logError(`[ScheduleEmailDispatcher] Unable to process due supplier emails: ${error.message}`);
      } finally {
        dispatchingScheduledEmails = false;
      }
    };
    void dispatchDueScheduledEmails();
    const scheduleEmailTimer = setInterval(dispatchDueScheduledEmails, 1_000);
    scheduleEmailTimer.unref();

    // 3. Proactively ensure port is available
    freePort(PORT);

    // 4. Start HTTP Listener (with auto-retry on EADDRINUSE)
    const server = app.listen(PORT);

    server.on('listening', () => {
      logSuccess(` Server running on port ${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logWarn(`  Port ${PORT} is in use. Attempting to free it...`);
        server.close();

        // Kill the blocking process and retry once after a short delay
        freePort(PORT);

        setTimeout(() => {
          logWarn(` Retrying to listen on port ${PORT}...`);
          server.listen(PORT);
        }, 1000);
      } else {
        logError(` Server error: ${err.message}`);
        process.exit(1);
      }
    });

    // 4. Graceful shutdown handlers
    const handleShutdown = (signal) => {
      logWarn(`  Received ${signal}. Shutting down gracefully...`);
      clearInterval(scheduleEmailTimer);
      server.close(() => {
        logSuccess(' Server stopped');
        process.exit(0);
      });

      // Force-exit if close takes longer than 10 s
      setTimeout(() => {
        logError(' Forcing shutdown after timeout');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGINT',  () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    process.on('unhandledRejection', (reason) => {
      logError(` Unhandled Rejection: ${reason?.stack || reason}`);
    });

    process.on('uncaughtException', (error) => {
      // Ignore EADDRINUSE here — handled by server.on('error') above
      if (error.code !== 'EADDRINUSE') {
        logError(` Uncaught Exception: ${error.stack || error.message}`);
        process.exit(1);
      }
    });

  } catch (error) {
    logError(` Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
// Watch trigger: updated OTP configuration and route handlers
