/* eslint-env node */

/**
 * design-library.routes.js
 * ─────────────────────────
 * Feature 9 — Reusable Customer Design Library
 *
 * Mount this router in app.js with:
 *   app.use('/api/library', libraryRoutes);
 *
 * Route map
 * ─────────
 *  Customer-facing (all require requireShopper middleware):
 *    POST   /api/library/save              → saveDesignToLibrary
 *    GET    /api/library                   → getCustomerLibrary
 *    POST   /api/library/:itemId/apply     → applyLibraryDesign
 *    DELETE /api/library/:itemId           → removeLibraryItem
 *
 *  Merchant / Admin (shop context via extractShopContext only):
 *    GET    /api/library/merchant/settings      → getMerchantSettings
 *    PUT    /api/library/merchant/settings      → upsertMerchantSettings
 *    DELETE /api/library/merchant/purge-expired → purgeExpiredItems
 *    GET    /api/library/merchant/all           → listAllLibraryItems
 */

import express from 'express';
import {
  saveDesignToLibrary,
  getCustomerLibrary,
  applyLibraryDesign,
  removeLibraryItem,
  getMerchantSettings,
  upsertMerchantSettings,
  purgeExpiredItems,
  listAllLibraryItems,
  getLibraryItemById,
} from '../controllers/design-library.controller.js';
import {
  extractShopContext,
  requireShopper,
} from '../middleware/shopper-auth.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// 1. Always inject shop context (reads x-shop header / query / env)
// ---------------------------------------------------------------------------
router.use(extractShopContext);

// ---------------------------------------------------------------------------
// 2. Merchant / Studio / Admin routes
// ---------------------------------------------------------------------------
router.get('/merchant/settings', getMerchantSettings);
router.put('/merchant/settings', upsertMerchantSettings);
router.delete('/merchant/purge-expired', purgeExpiredItems);
router.get('/merchant/all', listAllLibraryItems);

// Save design to library (supports both Studio direct saves and approved revision saves)
router.post('/save', saveDesignToLibrary);

// Get single library item by ID
router.get('/:itemId', getLibraryItemById);

// Remove library item (archives item)
router.delete('/:itemId', removeLibraryItem);

// ---------------------------------------------------------------------------
// 3. Customer-facing routes — require a logged-in shopper
// ---------------------------------------------------------------------------
router.use(requireShopper);

/**
 * GET /api/library
 * Return the authenticated customer's active, non-expired library items.
 */
router.get('/', getCustomerLibrary);

/**
 * POST /api/library/:itemId/apply
 * Apply a library design onto a new product.
 */
router.post('/:itemId/apply', applyLibraryDesign);

export default router;

