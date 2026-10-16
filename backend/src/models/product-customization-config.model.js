/* eslint-env node */

import mongoose from 'mongoose';

/**
 * ProductCustomizationConfig Schema (Feature 4 — Artwork Quality Checker & Print Areas)
 * Stores merchant-configured print-area requirements per product and variant.
 */
const productCustomizationConfigSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: [true, 'shop is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    shopifyProductId: {
      type: String,
      required: [true, 'shopifyProductId is required'],
      trim: true,
      index: true,
    },
    shopifyVariantId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    printAreaName: {
      type: String,
      trim: true,
      default: 'default',
    },

    // Physical print dimensions in millimeters
    printAreaWidthMm: {
      type: Number,
      required: [true, 'printAreaWidthMm is required'],
      min: [1, 'printAreaWidthMm must be at least 1 mm'],
    },
    printAreaHeightMm: {
      type: Number,
      required: [true, 'printAreaHeightMm is required'],
      min: [1, 'printAreaHeightMm must be at least 1 mm'],
    },

    // Target raster canvas dimensions in pixels
    printAreaWidthPx: {
      type: Number,
      required: true,
    },
    printAreaHeightPx: {
      type: Number,
      required: true,
    },

    // Optional minimum pixel bounds
    minWidthPx: {
      type: Number,
      default: null,
    },
    minHeightPx: {
      type: Number,
      default: null,
    },

    // Resolution requirements in DPI
    minDpi: {
      type: Number,
      default: 150,
      min: [50, 'minDpi must be at least 50'],
    },
    recommendedDpi: {
      type: Number,
      default: 300,
      min: [100, 'recommendedDpi must be at least 100'],
    },
    maxDpi: {
      type: Number,
      default: 1200,
    },

    // Quality thresholds
    blurThreshold: {
      type: Number,
      default: 90.0,
    },
    aspectRatioTolerance: {
      type: Number,
      default: 0.05, // 5%
    },
    maxFileSizeBytes: {
      type: Number,
      default: 26214400, // 25 MB
    },

    // Accepted formats and color spaces
    allowedFormats: {
      type: [String],
      default: ['image/png', 'image/jpeg', 'image/webp', 'image/tiff'],
    },
    allowedColorModes: {
      type: [String],
      default: ['rgb', 'srgb', 'cmyk'],
    },

    // Production output spec
    productionFormat: {
      type: String,
      enum: ['PDF', 'PNG', 'AI', 'EPS', 'TIFF'],
      default: 'PDF',
    },
    productionWidthMm: {
      type: Number,
    },
    productionHeightMm: {
      type: Number,
    },
    bleedMm: {
      type: Number,
      default: 3.0,
    },

    feasibilityRules: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'tbl_ProductCustomizationConfig',
  },
);

productCustomizationConfigSchema.index(
  { shop: 1, shopifyProductId: 1, shopifyVariantId: 1, printAreaName: 1 },
  { unique: true },
);

export const ProductCustomizationConfig =
  mongoose.models.ProductCustomizationConfig ||
  mongoose.model('ProductCustomizationConfig', productCustomizationConfigSchema);

export default ProductCustomizationConfig;
