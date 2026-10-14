/* eslint-env node */

import express from 'express';
import cors from 'cors';
import designRoutes from './routes/design.routes.js';
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
};
app.use(cors(corsOptions));

// -----------------------------------------------------------------------------
// 2. Request Parsing with High Body Limits (for complex canvas JSON trees)
// -----------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
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
app.use('/api/designs', designRoutes);

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

  res.status(statusCode).json({
    success: false,
    message:
      statusCode < 500
        ? err.message
        : 'An unexpected internal server error occurred.',
  });
});

export default app;
