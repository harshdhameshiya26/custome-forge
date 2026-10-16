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
} from '../controllers/design-library.controller.js';
import {
  extractShopContext,
  requireShopper,
} from '../middleware/shopify-proxy-auth.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// 1. Always inject shop context (reads x-shop header / query / env)
// ---------------------------------------------------------------------------
router.use(extractShopContext);

// ---------------------------------------------------------------------------
// 2. Merchant / Admin routes
//    Placed BEFORE requireShopper so they are not gated by customer auth.
//    In production these should be protected by a separate merchant-auth
//    middleware (Shopify session token or API key). Here they rely on
//    the extractShopContext shop scope only — add your own auth layer as needed.
// ---------------------------------------------------------------------------

/**
 * GET /api/library/merchant/settings
 * Fetch the merchant's design-library settings (retention, privacy).
 * Creates default settings if none exist yet.
 */
router.get('/merchant/settings', getMerchantSettings);

/**
 * PUT /api/library/merchant/settings
 * Create or update the merchant's design-library settings.
 *
 * Body (all optional, at least one required):
 *   libraryEnabled              boolean
 *   designRetentionDays         number   (0 = unlimited)
 *   defaultRetentionPolicy      string   KEEP_FOREVER | EXPIRES_AT | ORDER_BASED
 *   allowPublicDesigns          boolean
 *   maxLibraryItemsPerCustomer  number   (0 = unlimited)
 *   lastUpdatedBy               string
 */
router.put('/merchant/settings', upsertMerchantSettings);

/**
 * DELETE /api/library/merchant/purge-expired
 * Hard-delete all library items whose retentionExpiresAt < now.
 * Safe to call on a schedule or on-demand.
 */
router.delete('/merchant/purge-expired', purgeExpiredItems);

/**
 * GET /api/library/merchant/all
 * List all library items for the shop (all customers).
 * Supports pagination and optional filters (shopifyCustomerId, status, includeExpired).
 */
router.get('/merchant/all', listAllLibraryItems);

// ---------------------------------------------------------------------------
// 3. Customer-facing routes — require a logged-in shopper
// ---------------------------------------------------------------------------
router.use(requireShopper);

/**
 * POST /api/library/save
 * Flag an approved design revision into the customer's library.
 *
 * Body:
 *   designId        string   Required — ObjectId of the design
 *   revisionId      string   Required — ObjectId of the approved revision
 *   name            string   Required — Display name
 *   shopifyOrderId  string   Optional
 *   tags            string[] Optional
 *   thumbnailUrl    string   Optional
 *   retentionPolicy string   Optional — overrides merchant default
 *   savedBy         string   Optional — ORDER_WEBHOOK | MANUAL | STAFF_OVERRIDE
 */
router.post('/save', saveDesignToLibrary);

/**
 * GET /api/library
 * Return the authenticated customer's active, non-expired library items.
 *
 * Query params:
 *   page          number   Default 1
 *   limit         number   Default 20 (max 100)
 *   productId     string   Filter by original shopifyProductId
 *   tag           string   Filter by tag (exact match)
 *   includePublic boolean  Include public items from other customers
 */
router.get('/', getCustomerLibrary);

/**
 * POST /api/library/:itemId/apply
 * Apply a library design onto a new product.
 * Creates a new tbl_designs document seeded with the library item's canvas.
 *
 * Body:
 *   targetProductId string  Required — Shopify product to apply to
 *   changeNote      string  Optional
 *   thumbnailUrl    string  Optional
 */
router.post('/:itemId/apply', applyLibraryDesign);

/**
 * DELETE /api/library/:itemId
 * Archive (soft-delete) a library item owned by the authenticated customer.
 */
router.delete('/:itemId', removeLibraryItem);

export default router;
