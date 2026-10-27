import mongoose from 'mongoose';

/**
 * Design Schema for CustomForge
 * Supports cross-session persistence and shareability for feedback.
 * Stores canvas state (Fabric.js, Konva), scoped ownership, and share state.
 */
const designSchema = new mongoose.Schema(
  {
    // Shopify Product ID (numeric string or GID)
    productId: {
      type: String,
      required: [true, 'productId is required'],
      trim: true,
      index: true,
    },
    productVariantId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    shop: {
      type: String,
      required: [true, 'shop is required'],
      lowercase: true,
      trim: true,
      index: true,
    },

    // Logged-in Shopify Customer ID (persists across devices/sessions)
    customerId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    // Guest-session record ID
    sessionId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    // Serialized canvas JSON state (Fabric.js / Konva / Three.js state)
    canvasState: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'canvasState is required'],
      validate: {
        validator: function (val) {
          return val !== null && typeof val === 'object';
        },
        message: 'canvasState must be a non-null object representing canvas data',
      },
    },

    // Optional preview image URL / data URL for thumbnails
    thumbnailUrl: {
      type: String,
      trim: true,
      default: null,
    },

    // Hash of the random share token; the raw token is never persisted.
    shareTokenHash: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },

    // Design lifecycle status (draft, saved, shared, submitted, approved)
    status: {
      type: String,
      enum: {
        values: ['draft', 'saved', 'shared', 'submitted', 'approved'],
        message: '{VALUE} is not a valid design status (allowed: draft, saved, shared, submitted, approved)',
      },
      default: 'draft',
      index: true,
    },

    // Merchant template support
    isTemplate: {
      type: Boolean,
      default: false,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: null,
    },
    templateCategory: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    createdByRole: {
      type: String,
      enum: ['merchant', 'supplier'],
      default: 'merchant',
    },
    createdByUserId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'tbl_designs', // Adheres to 'tbl_' collection prefix convention
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        ret.isShared = Boolean(doc.shareTokenHash);
        delete ret.__v;
        delete ret.shareTokenHash;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        ret.isShared = Boolean(doc.shareTokenHash);
        delete ret.__v;
        delete ret.shareTokenHash;
        return ret;
      },
    },
  }
);

// Require at least one owner identifier: customerId or sessionId (unless it is a template or created by merchant)
designSchema.pre('validate', function (next) {
  if (!this.customerId && !this.sessionId && !this.isTemplate && this.createdByRole !== 'merchant') {
    this.invalidate('customerId', 'At least one of customerId or sessionId is required to persist the design across sessions');
    this.invalidate('sessionId', 'At least one of customerId or sessionId is required to persist the design across sessions');
  }
  next();
});

// Optimized compound indexes for fast lookups during cross-session resume and sharing
designSchema.index({ shop: 1, customerId: 1, productId: 1, updatedAt: -1 });
designSchema.index({ shop: 1, sessionId: 1, productId: 1, updatedAt: -1 });
designSchema.index({ isTemplate: 1, templateCategory: 1 });

// Model registered as tbl_Design (with 'tbl_' naming convention)
const Design = mongoose.models.tbl_Design || mongoose.model('tbl_Design', designSchema, 'tbl_designs');

export default Design;
