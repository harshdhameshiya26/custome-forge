/* eslint-env node */

/**
 * tbl_MerchantSettings — Feature 9: Design Library merchant configuration
 *
 * One document per shop. Governs:
 *   - Whether the design library is enabled at all.
 *   - How long designs are retained (designRetentionDays).
 *   - Default retention policy applied to new library items.
 *   - Privacy: whether customers can see each other's public designs.
 *   - Maximum library size per customer (0 = unlimited).
 */

import mongoose from 'mongoose';

const merchantSettingsSchema = new mongoose.Schema(
  {
    // ------------------------------------------------------------------
    // Shop identifier — one document per Shopify store
    // ------------------------------------------------------------------
    shop: {
      type: String,
      required: [true, 'shop is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    // ------------------------------------------------------------------
    // Feature 9 — Design Library settings
    // ------------------------------------------------------------------

    /** Master switch — if false, no library items are created or returned */
    libraryEnabled: {
      type: Boolean,
      default: true,
    },

    /**
     * Number of days a design is retained in the library after the order
     * ships (or after the design is approved, if no order exists).
     * 0 = keep forever (equivalent to KEEP_FOREVER policy).
     */
    designRetentionDays: {
      type: Number,
      default: 365,
      min: [0, 'designRetentionDays must be 0 or greater'],
    },

    /**
     * Default retention policy applied when adding a new library item.
     * Merchants can override per-item via the API.
     * KEEP_FOREVER | EXPIRES_AT | ORDER_BASED
     */
    defaultRetentionPolicy: {
      type: String,
      enum: {
        values: ['KEEP_FOREVER', 'EXPIRES_AT', 'ORDER_BASED'],
        message: '{VALUE} is not a valid retention policy',
      },
      default: 'ORDER_BASED',
    },

    /**
     * Whether customers can share their library items with other customers
     * of the same shop (isPublic flag on library items).
     */
    allowPublicDesigns: {
      type: Boolean,
      default: false,
    },

    /**
     * Maximum number of library items a single customer can hold.
     * 0 = unlimited. When the cap is reached the oldest item is archived.
     */
    maxLibraryItemsPerCustomer: {
      type: Number,
      default: 0,
      min: [0, 'maxLibraryItemsPerCustomer must be 0 or greater'],
    },

    // ------------------------------------------------------------------
    // Soft-audit fields (populated by the system, not the merchant)
    // ------------------------------------------------------------------

    /** Last time the merchant saved these settings */
    lastUpdatedBy: {
      type: String,      // Shopify staff member ID or "system"
      default: 'system',
    },
  },
  {
    timestamps: true,
    collection: 'tbl_merchant_settings',
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

const MerchantSettings =
  mongoose.models.tbl_MerchantSettings ||
  mongoose.model(
    'tbl_MerchantSettings',
    merchantSettingsSchema,
    'tbl_merchant_settings',
  );

export default MerchantSettings;
