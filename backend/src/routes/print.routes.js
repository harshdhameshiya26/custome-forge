/* eslint-env node */

import express from 'express';
import {
  generatePrintFile,
  downloadPrintFile,
  getPrintFilesByOrderId,
  getPrintFileById,
} from '../controllers/print.controller.js';
import { authenticateUser, requireVerifiedUser } from '../middleware/authenticate.js';

const router = express.Router();

/**
 * Feature Name: "Print-Ready File Generator"
 *
 * Route Definitions:
 *
 * 1. POST /api/print/generate/:orderId
 *    Triggers high-res print file generation for an order.
 *    - Validates proof approval status before manufacturing clearance.
 *    - Fetches or accepts canvas JSON state.
 *    - Scales vector and raster layers to exact physical millimeters at 300 DPI.
 *    - Returns generated file metadata, dimensions, and secure download URL.
 *
 * 2. GET /api/print/download/:fileId
 *    Secure file download endpoint.
 *    - Validates secure download token.
 *    - Streams high-res file with attachment content-disposition and correct MIME type.
 *
 * 3. GET /api/print/order/:orderId
 *    Retrieves all generated print files and status history for a given order.
 *
 * 4. GET /api/print/file/:fileId
 *    Retrieves details and status of a specific print file by fileId.
 */

// Generate print-ready production asset (requires verified user session)
router.post('/generate/:orderId', authenticateUser, requireVerifiedUser, generatePrintFile);

// Secure production file download endpoint (token-gated, no session required)
router.get('/download/:fileId', downloadPrintFile);

// Retrieve all generated production files for an order (requires auth)
router.get('/order/:orderId', authenticateUser, requireVerifiedUser, getPrintFilesByOrderId);

// Retrieve specific print file metadata by fileId (requires auth)
router.get('/file/:fileId', authenticateUser, requireVerifiedUser, getPrintFileById);

export default router;
