/* eslint-env node */

import express from 'express';
import cors from 'cors';
import designRoutes from './routes/design.routes.js';
import libraryRoutes from './routes/design-library.routes.js';
import artworkRoutes from './routes/artwork.routes.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';
import proofRoutes from './routes/proof.routes.js';
import commentRoutes from './routes/comment.routes.js';
import printRoutes from './routes/print.routes.js';
import ruleRoutes from './routes/rule.routes.js';
import billingRoutes from './routes/billing.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import userRoutes from './routes/user.routes.js';
import scheduleRoutes from './routes/schedule.routes.js';
import supplierRoutes from './routes/supplier.routes.js';
import { createNotification } from './services/notificationService.js';
import { logError } from './utils/logger.js';

const app = express();
app.disable('x-powered-by');

// -----------------------------------------------------------------------------
// 1. CORS Configuration
// -----------------------------------------------------------------------------
const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Shopify-Hmac-Sha256', 'X-Shopify-Topic', 'X-Shopify-Shop-Domain'],
  credentials: true,
};
app.use(cors(corsOptions));

// -----------------------------------------------------------------------------
// 2. Request Parsing with Raw Buffer Support (for Shopify Webhook HMAC Verification)
// -----------------------------------------------------------------------------
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// -----------------------------------------------------------------------------
// 3. Health Check & Diagnostics
// -----------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'CustomForge Backend',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'CustomForge API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// -----------------------------------------------------------------------------
// 4. API Routes Mounting
// -----------------------------------------------------------------------------

// Feature: User Authentication, Verification & Profile Management
app.use('/api/users', userRoutes);

app.use('/api/designs', designRoutes);

// Feature 9 — Reusable Customer Design Library
app.use('/api/library', libraryRoutes);

// Feature 4 — Artwork Quality Checker
app.use('/api/artwork', artworkRoutes);

// Feature 5 — Production Feasibility Checker
app.use('/api/products', productRoutes);

// Feature 6 — Custom Order Status Timeline
app.use('/api/orders', orderRoutes);

// Feature 2 — Proof Approval Before Production
app.use('/api/proofs', proofRoutes);

// Feature 7 — Customer-Merchant Design Comments
app.use('/api/comments', commentRoutes);

// Feature 3 — Print-Ready File Generator
app.use('/api/print', printRoutes);

// Feature 10 — Production Handoff Rules
app.use('/api/rules', ruleRoutes);

// Feature: Shopify Billing API Integration
app.use('/api/billing', billingRoutes);

// Shopify Webhooks
app.use('/api/webhooks', webhookRoutes);

// Feature: Centralized Application Notification System (Top-Right Slide-In Panel)
app.use('/api/notifications', notificationRoutes);

// Feature: Supplier Registration & Design Scheduling System
app.use('/api/schedules', scheduleRoutes);
app.use('/api/suppliers', supplierRoutes);

// -----------------------------------------------------------------------------
// 5. 404 Route Not Found Handler
// -----------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl} - Route not found`,
  });
});

// -----------------------------------------------------------------------------
// 6. Global Error Handling Middleware
// -----------------------------------------------------------------------------
app.use((err, req, res, next) => {
  void next;
  logError(`❌ [Global Error] ${err.message || 'Internal Server Error'}`);

  const statusCode =
    err.statusCode ||
    err.status ||
    (res.statusCode >= 400 ? res.statusCode : 500);

  // Automatically log critical execution errors as FEATURE_ERROR notifications in DB
  const errorShop =
    req.shop ||
    req.shopDomain ||
    req.user?.shop ||
    req.get('x-shopify-shop-domain') ||
    req.get('x-shop') ||
    req.query?.shop ||
    (req.body && typeof req.body === 'object' && req.body.shop) ||
    process.env.SHOPIFY_SHOP ||
    process.env.SHOP ||
    null;

  if (statusCode >= 500 && errorShop) {
    const routeIdentifier = `${req.method} ${req.baseUrl || req.path}`;
    const cleanMessage =
      err.message && typeof err.message === 'string'
        ? err.message
        : 'An unexpected internal server error occurred while processing this action.';

    createNotification({
      shopDomain: errorShop,
      type: 'FEATURE_ERROR',
      severity: 'ERROR',
      title: `Feature Error on ${routeIdentifier}`,
      message: cleanMessage,
    }).catch((notifErr) => {
      logError(`⚠️ [Global Error Handler] Failed to persist FEATURE_ERROR notification: ${notifErr.message}`);
    });
  }

  res.status(statusCode).json({
    success: false,
    message:
      statusCode < 500
        ? err.message
        : 'An unexpected internal server error occurred.',
  });
});

export default app;
