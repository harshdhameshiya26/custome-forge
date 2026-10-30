/* eslint-env node */

/**
 * design-library.controller.js
 * ────────────────────────────
 * Feature 9 — Reusable Customer Design Library
 *
 * Exposed operations
 * ──────────────────
 *  Customer-facing (require shopifyCustomerId via requireShopper middleware):
 *    POST   /api/library/save                  → saveDesignToLibrary
 *    GET    /api/library                        → getCustomerLibrary
 *    POST   /api/library/:itemId/apply          → applyLibraryDesign
 *    DELETE /api/library/:itemId                → removeLibraryItem
 *
 *  Merchant/Admin (no per-customer auth — shop context only):
 *    GET    /api/library/merchant/settings      → getMerchantSettings
 *    PUT    /api/library/merchant/settings      → upsertMerchantSettings
 *    DELETE /api/library/merchant/purge-expired → purgeExpiredItems   (admin)
 *    GET    /api/library/merchant/all           → listAllLibraryItems (admin)
 */

import mongoose from 'mongoose';
import Design from '../models/design.model.js';
import DesignRevision from '../models/design-revision.model.js';
import DesignLibraryItem from '../models/design-library-item.model.js';
import MerchantSettings from '../models/merchant-settings.model.js';
import OtpService from '../services/otpService.js';
import { logError, logWarn } from '../utils/logger.js';
import { validateCustomizerCanvasState } from '../utils/canvas-state.validators.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Create a uniform HTTP error with a status code attached */
const makeHttpError = (statusCode, message) =>
  Object.assign(new Error(message), { statusCode });

/** Validate ObjectId strings */
const isValidId = (id) => mongoose.isValidObjectId(id);

const MAX_PAGE_SIZE = 100;

/**
 * Fetch (or create with defaults) the MerchantSettings document for a shop.
 * @param {string} shop
 * @returns {Promise<import('../models/merchant-settings.model.js').default>}
 */
const getOrCreateSettings = async (shop) => {
  let settings = await MerchantSettings.findOne({ shop });
  if (!settings) {
    settings = await MerchantSettings.create({ shop });
  }
  return settings;
};

/**
 * Compute the retention expiry date based on merchant settings.
 *
 * @param {object} settings    MerchantSettings document
 * @param {string} policy      Effective retention policy
 * @param {Date|null} anchor   Reference date (e.g. order placed / now)
 * @returns {Date|null}
 */
const computeExpiresAt = (settings, policy, anchor = new Date()) => {
  if (policy === 'KEEP_FOREVER' || settings.designRetentionDays === 0) {
    return null;
  }
  const expiresAt = new Date(anchor);
  expiresAt.setDate(expiresAt.getDate() + settings.designRetentionDays);
  return expiresAt;
};

/**
 * Build the Mongoose filter that excludes expired items for customer views.
 * An item is considered active when:
 *   - status === 'active'
 *   - AND (retentionExpiresAt is null OR retentionExpiresAt > now)
 */
const activeItemFilter = () => ({
  status: 'active',
  $or: [
    { retentionExpiresAt: null },
    { retentionExpiresAt: { $gt: new Date() } },
  ],
});

// ===========================================================================
// CUSTOMER-FACING CONTROLLERS
// ===========================================================================

// ---------------------------------------------------------------------------
// POST /api/library/save
// ---------------------------------------------------------------------------
/**
 * Save or flag an approved design into the customer's design library.
 *
 * This endpoint is called either:
 *   (a) Automatically by an order webhook handler after a design is approved
 *       and the order ships; or
 *   (b) Manually by a customer from the storefront after their design is
 *       flagged as "approved".
 *
 * Body parameters:
 *   designId        {string}  Required — ObjectId of the tbl_designs document
 *   revisionId      {string}  Required — ObjectId of the approved tbl_design_revisions document
 *   name            {string}  Required — Display name shown in the library
 *   shopifyOrderId  {string}  Optional — Shopify Order ID (GID or numeric)
 *   tags            {string[]}Optional — Freeform tags
 *   thumbnailUrl    {string}  Optional — Override thumbnail URL
 *   retentionPolicy {string}  Optional — Override merchant default
 *   savedBy         {string}  Optional — 'ORDER_WEBHOOK' | 'MANUAL' | 'STAFF_OVERRIDE'
 */
export const saveDesignToLibrary = async (request, response, next) => {
  try {
    const shopper = request.shopper;
    const shop =
      request.shop ||
      shopper?.shop ||
      request.get('x-shop') ||
      request.get('x-shopify-shop-domain') ||
      process.env.SHOPIFY_SHOP ||
      'custome-forge.myshopify.com';

    const customerId =
      shopper?.customerId ||
      request.get('x-customer-id') ||
      request.body?.shopifyCustomerId ||
      'merchant';

    const {
      designId,
      revisionId,
      studioKey,
      shopifyProductId,
      canvasState,
      name,
      shopifyOrderId,
      tags,
      thumbnailUrl,
      retentionPolicy: policyOverride,
      savedBy = 'MANUAL',
    } = request.body ?? {};

    if (canvasState !== undefined && canvasState !== null) {
      validateCustomizerCanvasState(canvasState);
    }

    const displayName = (name || canvasState?.text || 'Saved Design').trim();
    if (!displayName || displayName.length > 200) {
      throw makeHttpError(400, 'name must be a non-empty string of 200 characters or fewer.');
    }

    const settings = await getOrCreateSettings(shop);
    if (!settings.libraryEnabled) {
      throw makeHttpError(403, 'The design library is disabled for this shop.');
    }

    // Direct studio save (with canvasState provided)
    if (canvasState && typeof canvasState === 'object') {
      const prodId = shopifyProductId || canvasState.productId || 'tshirt';
      const cleanTags = Array.isArray(tags)
        ? tags.map((t) => String(t).trim()).filter(Boolean)
        : [prodId];
      const thumb = thumbnailUrl || canvasState.uploadedImageUrl || null;

      const safeStudioKey = typeof studioKey === 'string' && studioKey.trim()
        ? studioKey.trim().slice(0, 200)
        : null;
      const libraryData = {
        shop,
        shopifyCustomerId: customerId,
        designId: designId && isValidId(designId) ? designId : null,
        revisionId: revisionId && isValidId(revisionId) ? revisionId : null,
        studioKey: safeStudioKey,
        shopifyProductId: prodId,
        name: displayName,
        thumbnailUrl: thumb,
        tags: cleanTags,
        shopifyOrderId: shopifyOrderId ?? null,
        retentionPolicy: 'KEEP_FOREVER',
        retentionExpiresAt: null,
        status: 'active',
        canvasState,
        savedBy,
      };
      const existingStudioItem = safeStudioKey
        ? await DesignLibraryItem.findOne({ shop, shopifyCustomerId: customerId, studioKey: safeStudioKey })
        : null;
      const libraryItem = existingStudioItem
        ? await DesignLibraryItem.findOneAndUpdate(
            { _id: existingStudioItem._id },
            { $set: libraryData },
            { new: true, runValidators: true },
          )
        : await DesignLibraryItem.create(libraryData);

      return response.status(201).json({
        success: true,
        message: 'Design saved to library successfully.',
        data: {
          item: {
            ...libraryItem.toJSON(),
            id: libraryItem._id,
          },
        },
      });
    }

    // Existing flow with designId and revisionId
    if (!designId || !isValidId(designId)) {
      throw makeHttpError(400, 'designId or canvasState must be provided.');
    }
    if (!revisionId || !isValidId(revisionId)) {
      throw makeHttpError(400, 'revisionId must be a valid revision ObjectId.');
    }

    // --- Verify the design exists and belongs to this customer -------------
    const design = await Design.findOne({
      _id: designId,
      shop,
      customerId: shopper.customerId,
    }).select('_id productId thumbnailUrl status canvasState').lean();

    if (!design) {
      throw makeHttpError(404, 'Design not found or does not belong to this customer.');
    }

    // --- Verify the revision exists and is approved -------------------------
    const revision = await DesignRevision.findOne({
      _id: revisionId,
      designId,
      shop,
    }).lean();

    if (!revision) {
      throw makeHttpError(404, 'Revision not found for the given design.');
    }
    if (revision.status !== 'approved') {
      throw makeHttpError(
        422,
        `Only approved revisions can be saved to the library. This revision has status "${revision.status}".`,
      );
    }

    // --- Resolve retention policy & expiry ---------------------------------
    const effectivePolicy =
      policyOverride && ['KEEP_FOREVER', 'EXPIRES_AT', 'ORDER_BASED'].includes(policyOverride)
        ? policyOverride
        : settings.defaultRetentionPolicy;

    const retentionExpiresAt = computeExpiresAt(settings, effectivePolicy, new Date());

    // --- Enforce per-customer cap (if configured) --------------------------
    if (settings.maxLibraryItemsPerCustomer > 0) {
      const currentCount = await DesignLibraryItem.countDocuments({
        shop,
        shopifyCustomerId: shopper.customerId,
        ...activeItemFilter(),
      });

      if (currentCount >= settings.maxLibraryItemsPerCustomer) {
        // Archive the oldest active item to make room
        const oldest = await DesignLibraryItem.findOne({
          shop,
          shopifyCustomerId: shopper.customerId,
          ...activeItemFilter(),
        })
          .sort({ createdAt: 1 })
          .select('_id');

        if (oldest) {
          await DesignLibraryItem.findByIdAndUpdate(oldest._id, { $set: { status: 'archived' } });
          logWarn(
            `[Library] Archived oldest item ${oldest._id} for customer ${shopper.customerId} to stay within cap of ${settings.maxLibraryItemsPerCustomer}.`,
          );
        }
      }
    }

    // --- Upsert the library item (idempotent on shop+customer+design) ------
    const libraryItem = await DesignLibraryItem.findOneAndUpdate(
      {
        shop,
        shopifyCustomerId: shopper.customerId,
        designId,
      },
      {
        $set: {
          revisionId,
          shopifyProductId: design.productId ?? null,
          name: name.trim(),
          thumbnailUrl: thumbnailUrl ?? revision.thumbnailUrl ?? design.thumbnailUrl ?? null,
          tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [],
          shopifyOrderId: shopifyOrderId ?? null,
          retentionPolicy: effectivePolicy,
          retentionExpiresAt,
          status: 'active',
          canvasState: revision.canvasState,
          savedBy,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    return response.status(201).json({
      success: true,
      message: 'Design saved to library.',
      data: { libraryItem: libraryItem.toJSON() },
    });
  } catch (error) {
    logError(`[Library] saveDesignToLibrary failed: ${error.message}`);
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/library
// ---------------------------------------------------------------------------
/**
 * Fetch the authenticated customer's reusable design library.
 *
 * Filters out expired items (retentionExpiresAt < now) and archived items.
 * Supports pagination and optional filtering by productId or tags.
 *
 * Query params:
 *   page        {number}  Default 1
 *   limit       {number}  Default 20, max 100
 *   productId   {string}  Optional — filter by original product
 *   tag         {string}  Optional — filter by tag (exact match)
 *   includePublic {boolean} Optional — also return isPublic items from the shop
 */
export const getCustomerLibrary = async (request, response, next) => {
  try {
    const { shopper } = request;
    if (!shopper?.customerId) {
      throw makeHttpError(401, 'A logged-in customer ID is required to access the library.');
    }

    const shop = shopper.shop;
    const settings = await getOrCreateSettings(shop);

    if (!settings.libraryEnabled) {
      return response.status(200).json({
        success: true,
        data: { items: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } },
        meta: { libraryEnabled: false },
      });
    }

    // --- Pagination ---------------------------------------------------------
    const limit = Math.min(Number(request.query.limit ?? 20), MAX_PAGE_SIZE);
    const page = Math.max(Number(request.query.page ?? 1), 1);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw makeHttpError(400, 'limit must be a positive integer up to 100.');
    }
    if (!Number.isSafeInteger(page)) {
      throw makeHttpError(400, 'page must be a positive integer.');
    }

    // --- Base filter: own active, non-expired items -------------------------
    const baseFilter = {
      shop,
      shopifyCustomerId: shopper.customerId,
      ...activeItemFilter(),
    };

    // --- Optional product filter -------------------------------------------
    const productId =
      typeof request.query.productId === 'string' ? request.query.productId.trim() : null;
    if (productId) baseFilter.shopifyProductId = productId;

    // --- Optional tag filter -----------------------------------------------
    const tag = typeof request.query.tag === 'string' ? request.query.tag.trim() : null;
    if (tag) baseFilter.tags = tag;

    // --- Optionally include public items from the shop --------------------
    let filter = baseFilter;
    if (
      settings.allowPublicDesigns &&
      request.query.includePublic === 'true'
    ) {
      filter = {
        $or: [
          baseFilter,
          {
            shop,
            isPublic: true,
            ...activeItemFilter(),
            ...(productId ? { shopifyProductId: productId } : {}),
            ...(tag ? { tags: tag } : {}),
          },
        ],
      };
    }

    // --- Execute query ------------------------------------------------------
    const [items, total] = await Promise.all([
      DesignLibraryItem.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean({ virtuals: true }),
      DesignLibraryItem.countDocuments(filter),
    ]);

    return response.status(200).json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
      meta: {
        libraryEnabled: settings.libraryEnabled,
        retentionDays: settings.designRetentionDays,
      },
    });
  } catch (error) {
    logError(`[Library] getCustomerLibrary failed: ${error.message}`);
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/library/:itemId/apply
// ---------------------------------------------------------------------------
/**
 * Apply a design from the library onto a new product.
 *
 * Creates a brand-new tbl_designs document pre-seeded with the library
 * item's canvas state. Does NOT clone revisions — the new design starts at
 * version 1 with a 'draft' status. The caller should proceed with the
 * normal design → revision → approval flow from there.
 *
 * Body parameters:
 *   targetProductId {string}  Required — Shopify Product ID of the destination product
 *   changeNote      {string}  Optional — Note attached to the initial revision
 *   thumbnailUrl    {string}  Optional — Override thumbnail
 */
export const applyLibraryDesign = async (request, response, next) => {
  try {
    const { shopper } = request;
    if (!shopper?.customerId) {
      throw makeHttpError(401, 'A logged-in customer ID is required.');
    }

    const { itemId } = request.params;
    if (!isValidId(itemId)) {
      throw makeHttpError(400, 'itemId must be a valid ObjectId.');
    }

    const { targetProductId, changeNote, thumbnailUrl } = request.body ?? {};

    if (typeof targetProductId !== 'string' || !targetProductId.trim()) {
      throw makeHttpError(400, 'targetProductId must be a non-empty string.');
    }

    const shop = shopper.shop;
    const settings = await getOrCreateSettings(shop);
    if (!settings.libraryEnabled) {
      throw makeHttpError(403, 'The design library is disabled for this shop.');
    }

    // --- Fetch the library item (own OR public) ----------------------------
    const libraryItem = await DesignLibraryItem.findOne({
      _id: itemId,
      shop,
      ...activeItemFilter(),
      $or: [
        { shopifyCustomerId: shopper.customerId },
        ...(settings.allowPublicDesigns ? [{ isPublic: true }] : []),
      ],
    }).lean();

    if (!libraryItem) {
      throw makeHttpError(
        404,
        'Library item not found, expired, or not accessible.',
      );
    }

    // --- Create new Design pre-seeded from library canvas state -----------
    const crypto = await import('node:crypto');
    const shareToken = crypto.default.randomBytes(32).toString('base64url');
    const shareTokenHash = crypto.default
      .createHash('sha256')
      .update(shareToken)
      .digest('hex');

    const newDesign = await Design.create({
      shop,
      customerId: shopper.customerId,
      sessionId: null,
      productId: targetProductId.trim(),
      canvasState: libraryItem.canvasState,
      thumbnailUrl: thumbnailUrl ?? libraryItem.thumbnailUrl ?? null,
      shareTokenHash,
      status: 'draft',
      version: 1,
    });

    // --- Create initial revision snapshot ----------------------------------
    const { storeRevision } = await import('./revision.controller.js');
    await storeRevision(newDesign, null, {
      changedBy: request.user?.role || 'merchant',
      changeNote:
        changeNote ??
        `Applied from library item "${libraryItem.name}" (${libraryItem._id})`,
    });

    return response.status(201).json({
      success: true,
      message: 'Library design applied to new product. New design created in draft status.',
      data: {
        design: newDesign.toJSON(),
        sourceLibraryItemId: libraryItem._id,
        shareToken,
      },
    });
  } catch (error) {
    logError(`[Library] applyLibraryDesign failed: ${error.message}`);
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/library/:itemId
// ---------------------------------------------------------------------------
/**
 * Archive (soft-delete) a customer's own library item.
 * Customers cannot hard-delete; only merchants can purge via admin endpoint.
 */
export const removeLibraryItem = async (request, response, next) => {
  try {
    const { shopper } = request;
    const shop =
      request.shop ||
      shopper?.shop ||
      request.get('x-shop') ||
      request.get('x-shopify-shop-domain') ||
      process.env.SHOPIFY_SHOP ||
      'custome-forge.myshopify.com';

    const { itemId } = request.params;
    if (!isValidId(itemId)) {
      throw makeHttpError(400, 'itemId must be a valid ObjectId.');
    }

    const query = { _id: itemId };
    if (shop) query.shop = shop;
    if (shopper?.customerId) query.shopifyCustomerId = shopper.customerId;

    const updated = await DesignLibraryItem.findOneAndUpdate(
      query,
      { $set: { status: 'archived' } },
      { new: true },
    );

    if (!updated) {
      throw makeHttpError(404, 'Library item not found or already removed.');
    }

    return response.status(200).json({
      success: true,
      message: 'Library item archived.',
      data: { libraryItem: updated.toJSON() },
    });
  } catch (error) {
    logError(`[Library] removeLibraryItem failed: ${error.message}`);
    return next(error);
  }
};

/**
 * GET /api/library/:itemId
 * Fetch single library item by ID
 */
export const getLibraryItemById = async (request, response, next) => {
  try {
    const { itemId } = request.params;
    if (!isValidId(itemId)) {
      throw makeHttpError(400, 'itemId must be a valid ObjectId.');
    }
    const item = await DesignLibraryItem.findById(itemId).lean({ virtuals: true });
    if (!item) {
      throw makeHttpError(404, 'Library item not found.');
    }
    return response.status(200).json({
      success: true,
      data: {
        item: { ...item, id: item._id },
      },
    });
  } catch (error) {
    return next(error);
  }
};


// ===========================================================================
// MERCHANT / ADMIN CONTROLLERS
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /api/library/merchant/settings
// ---------------------------------------------------------------------------
/**
 * Fetch merchant retention and privacy settings for the shop.
 * Creates and returns defaults if no settings document exists yet.
 */
export const getMerchantSettings = async (request, response, next) => {
  try {
    const shop = request.shop;
    if (!shop) throw makeHttpError(400, 'Shop context is missing.');

    const settings = await getOrCreateSettings(shop);

    return response.status(200).json({
      success: true,
      data: { settings: settings.toJSON() },
    });
  } catch (error) {
    logError(`[Library] getMerchantSettings failed: ${error.message}`);
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/library/merchant/settings
// ---------------------------------------------------------------------------
/**
 * Create or fully update the merchant design-library settings for a shop.
 *
 * Accepted body fields:
 *   libraryEnabled              {boolean}
 *   designRetentionDays         {number}  0 = unlimited
 *   defaultRetentionPolicy      {string}  KEEP_FOREVER | EXPIRES_AT | ORDER_BASED
 *   allowPublicDesigns          {boolean}
 *   maxLibraryItemsPerCustomer  {number}  0 = unlimited
 *   lastUpdatedBy               {string}  Staff member ID or identifier
 */
export const upsertMerchantSettings = async (request, response, next) => {
  try {
    const shop = request.shop;
    if (!shop) throw makeHttpError(400, 'Shop context is missing.');

    const body = request.body ?? {};
    const allowedFields = [
      'libraryEnabled',
      'designRetentionDays',
      'defaultRetentionPolicy',
      'allowPublicDesigns',
      'maxLibraryItemsPerCustomer',
      'lastUpdatedBy',
    ];

    // --- Whitelist incoming fields ----------------------------------------
    const update = {};
    for (const field of allowedFields) {
      if (field in body) update[field] = body[field];
    }

    // --- Field-level validation -------------------------------------------
    if ('designRetentionDays' in update) {
      const days = Number(update.designRetentionDays);
      if (!Number.isFinite(days) || days < 0) {
        throw makeHttpError(400, 'designRetentionDays must be a non-negative number.');
      }
      update.designRetentionDays = days;
    }

    if ('maxLibraryItemsPerCustomer' in update) {
      const cap = Number(update.maxLibraryItemsPerCustomer);
      if (!Number.isFinite(cap) || cap < 0) {
        throw makeHttpError(400, 'maxLibraryItemsPerCustomer must be a non-negative number.');
      }
      update.maxLibraryItemsPerCustomer = cap;
    }

    if (
      'defaultRetentionPolicy' in update &&
      !['KEEP_FOREVER', 'EXPIRES_AT', 'ORDER_BASED'].includes(update.defaultRetentionPolicy)
    ) {
      throw makeHttpError(
        400,
        'defaultRetentionPolicy must be KEEP_FOREVER, EXPIRES_AT, or ORDER_BASED.',
      );
    }

    if (Object.keys(update).length === 0) {
      throw makeHttpError(400, 'No valid fields provided for update.');
    }

    // --- Upsert -----------------------------------------------------------
    const settings = await MerchantSettings.findOneAndUpdate(
      { shop },
      { $set: update },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    return response.status(200).json({
      success: true,
      message: 'Merchant settings updated.',
      data: { settings: settings.toJSON() },
    });
  } catch (error) {
    logError(`[Library] upsertMerchantSettings failed: ${error.message}`);
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/library/merchant/purge-expired
// ---------------------------------------------------------------------------
/**
 * Hard-delete all library items whose retentionExpiresAt is in the past.
 * This is an admin/merchant operation — not customer-facing.
 * Can be triggered on demand or hooked into a cron job / Shopify webhook.
 *
 * Returns the number of documents permanently deleted.
 */
export const purgeExpiredItems = async (request, response, next) => {
  try {
    const shop = request.shop;
    if (!shop) throw makeHttpError(400, 'Shop context is missing.');

    const result = await DesignLibraryItem.deleteMany({
      shop,
      retentionExpiresAt: { $lte: new Date() },
      retentionPolicy: { $ne: 'KEEP_FOREVER' },
    });

    return response.status(200).json({
      success: true,
      message: `Purged ${result.deletedCount} expired library item(s).`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    logError(`[Library] purgeExpiredItems failed: ${error.message}`);
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/library/merchant/all
// ---------------------------------------------------------------------------
/**
 * List all library items across all customers for the shop.
 * Useful for the merchant admin dashboard — shows active + archived + expired.
 *
 * Query params:
 *   page            {number}  Default 1
 *   limit           {number}  Default 20, max 100
 *   shopifyCustomerId {string} Optional filter by customer
 *   status          {string}  Optional filter: active | archived
 *   includeExpired  {boolean} Default false — set true to include expired items
 */
export const listAllLibraryItems = async (request, response, next) => {
  try {
    const shop = request.shop;
    if (!shop) throw makeHttpError(400, 'Shop context is missing.');

    const limit = Math.min(Number(request.query.limit ?? 20), MAX_PAGE_SIZE);
    const page = Math.max(Number(request.query.page ?? 1), 1);

    const filter = { shop };

    // Optional: filter by specific customer
    if (typeof request.query.shopifyCustomerId === 'string') {
      filter.shopifyCustomerId = request.query.shopifyCustomerId.trim();
    }

    // Optional: filter by status
    if (['active', 'archived'].includes(request.query.status)) {
      filter.status = request.query.status;
    }

    // Optional: exclude expired (default: exclude)
    if (request.query.includeExpired !== 'true') {
      filter.$or = [
        { retentionExpiresAt: null },
        { retentionExpiresAt: { $gt: new Date() } },
      ];
    }

    const [items, total] = await Promise.all([
      DesignLibraryItem.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean({ virtuals: true }),
      DesignLibraryItem.countDocuments(filter),
    ]);

    return response.status(200).json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logError(`[Library] listAllLibraryItems failed: ${error.message}`);
    return next(error);
  }
};
