/* eslint-env node */

/**
 * tbl_DesignLibraryItem — Feature 9: Reusable Customer Design Library
 *
 * Stores approved designs that are available for a customer to reuse on
 * future orders. Each record is scoped to a shop + customerId and references
 * the original Design and the specific approved Revision that was pinned.
 *
 * Retention is enforced at query time by comparing retentionExpiresAt with
 * the current timestamp; expired items are excluded from all customer-facing
 * endpoints. Hard-deletion of expired items is performed by the optional
 * /admin/library/purge-expired endpoint (merchant-triggered or scheduled).
 */

import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Retention policy enum values
// ---------------------------------------------------------------------------
export const RETENTION_POLICIES = {
  KEEP_FOREVER: 'KEEP_FOREVER',  // Item never expires (merchant override)
  EXPIRES_AT: 'EXPIRES_AT',      // Item expires on a specific absolute date
  ORDER_BASED: 'ORDER_BASED',    // Expiry anchored to Shopify order data
};

const designLibraryItemSchema = new mongoose.Schema(
  {
    // ------------------------------------------------------------------
    // Shop + Customer scope (mandatory)
    // ------------------------------------------------------------------
    shop: {
      type: String,
      required: [true, 'shop is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    shopifyCustomerId: {
      type: String,
      required: [true, 'shopifyCustomerId is required'],
      trim: true,
      index: true,
    },

    // ------------------------------------------------------------------
    // Source Design reference (the original tbl_designs document)
    // ------------------------------------------------------------------
    designId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'tbl_Design',
      required: [true, 'designId is required'],
      index: true,
    },

    // ------------------------------------------------------------------
    // Pinned approved Revision reference (tbl_design_revisions document)
    // ------------------------------------------------------------------
    revisionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'tbl_DesignRevision',
      required: [true, 'revisionId is required'],
    },

    // ------------------------------------------------------------------
    // Product this design was originally created for
    // ------------------------------------------------------------------
    shopifyProductId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    // ------------------------------------------------------------------
    // Display metadata
    // ------------------------------------------------------------------
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
      maxlength: [200, 'name must be 200 characters or fewer'],
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },

    // ------------------------------------------------------------------
    // Privacy: whether the design is visible to all customers of the shop
    // ------------------------------------------------------------------
    isPublic: {
      type: Boolean,
      default: false,
    },

    // ------------------------------------------------------------------
    // The Shopify order that triggered the library save
    // ------------------------------------------------------------------
    shopifyOrderId: {
      type: String,
      trim: true,
      default: null,
    },

    // ------------------------------------------------------------------
    // Retention policy
    // ------------------------------------------------------------------
    /**
     * KEEP_FOREVER — never expires (requires merchant explicit config)
     * EXPIRES_AT   — expires on retentionExpiresAt
     * ORDER_BASED  — retentionExpiresAt is computed from merchant setting
     *                at the time the item is saved
     */
    retentionPolicy: {
      type: String,
      enum: {
        values: ['KEEP_FOREVER', 'EXPIRES_AT', 'ORDER_BASED'],
        message: '{VALUE} is not a valid retention policy',
      },
      default: 'ORDER_BASED',
      index: true,
    },
    retentionExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    // ------------------------------------------------------------------
    // Lifecycle status: active | archived
    // ------------------------------------------------------------------
    status: {
      type: String,
      enum: {
        values: ['active', 'archived'],
        message: '{VALUE} is not a valid library item status',
      },
      default: 'active',
      index: true,
    },

    // ------------------------------------------------------------------
    // Canvas state snapshot captured at approval time
    // (copy from the revision — avoids a second join on reuse)
    // ------------------------------------------------------------------
    canvasState: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'canvasState is required'],
    },

    // ------------------------------------------------------------------
    // Audit: who/what flagged this item into the library
    // Values: ORDER_WEBHOOK | MANUAL | STAFF_OVERRIDE
    // ------------------------------------------------------------------
    savedBy: {
      type: String,
      enum: ['ORDER_WEBHOOK', 'MANUAL', 'STAFF_OVERRIDE'],
      default: 'ORDER_WEBHOOK',
    },
  },
  {
    timestamps: true,
    collection: 'tbl_design_library_items',
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

// ---------------------------------------------------------------------------
// Compound indexes
// ---------------------------------------------------------------------------

// Primary list query: customer library page sorted by creation
designLibraryItemSchema.index(
  { shop: 1, shopifyCustomerId: 1, status: 1, retentionExpiresAt: 1, createdAt: -1 },
);

// Fast "is there already a library item for this design?" check
designLibraryItemSchema.index(
  { shop: 1, shopifyCustomerId: 1, designId: 1 },
  { unique: true },
);

// Public-design lookup (merchant-shared items visible to all customers)
designLibraryItemSchema.index({ shop: 1, isPublic: 1, status: 1 });

// ---------------------------------------------------------------------------
// Virtual: hasExpired — computed at runtime without querying
// ---------------------------------------------------------------------------
designLibraryItemSchema.virtual('hasExpired').get(function () {
  if (this.retentionPolicy === 'KEEP_FOREVER' || !this.retentionExpiresAt) {
    return false;
  }
  return new Date() > this.retentionExpiresAt;
});

const DesignLibraryItem =
  mongoose.models.tbl_DesignLibraryItem ||
  mongoose.model(
    'tbl_DesignLibraryItem',
    designLibraryItemSchema,
    'tbl_design_library_items',
  );

export default DesignLibraryItem;
