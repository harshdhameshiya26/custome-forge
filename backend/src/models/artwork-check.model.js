/* eslint-env node */

import mongoose from 'mongoose';

/**
 * ArtworkCheck Schema (Feature 4 — Artwork Quality Checker Audit Log)
 * Stores full audit trails of image checks performed before checkout.
 */
const artworkCheckSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },
    shopifyProductId: {
      type: String,
      trim: true,
      index: true,
    },
    shopifyVariantId: {
      type: String,
      trim: true,
      default: null,
    },
    printAreaName: {
      type: String,
      default: 'default',
    },
    designId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Design',
      default: null,
      index: true,
    },
    revisionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DesignRevision',
      default: null,
    },

    fileName: {
      type: String,
    },
    fileSizeBytes: {
      type: Number,
    },
    mimeType: {
      type: String,
    },

    status: {
      type: String,
      enum: ['PENDING', 'PASSED', 'WARNED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    overallQualityScore: {
      type: Number,
      min: 0,
      max: 100,
    },

    // Detected metrics
    resolutionDpi: Number,
    effectiveDpi: Number,
    widthPx: Number,
    heightPx: Number,
    aspectRatio: Number,
    blurScore: Number,
    isBlurry: Boolean,
    colorMode: String,
    fileFormat: String,

    // Audit logs of issues, warnings, and suggested fixes
    issues: [mongoose.Schema.Types.Mixed],
    warnings: [String],
    suggestedFixes: [String],

    // Requirements applied at check time
    requiredDpi: Number,
    requiredMinDpi: Number,
    requiredWidthPx: Number,
    requiredHeightPx: Number,
    targetAspectRatio: Number,
    aspectRatioTolerance: Number,
  },
  {
    timestamps: { createdAt: 'checkedAt', updatedAt: false },
    collection: 'tbl_ArtworkCheck',
  },
);

export const ArtworkCheck =
  mongoose.models.ArtworkCheck ||
  mongoose.model('ArtworkCheck', artworkCheckSchema);

export default ArtworkCheck;
