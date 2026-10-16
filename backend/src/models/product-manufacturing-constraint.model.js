/* eslint-env node */

import mongoose from 'mongoose';

/**
 * ProductManufacturingConstraint Schema (Feature 5 — Feasibility Rules)
 * Stores manufacturing rules, printable physical limits, placement bounds,
 * material availability, and incompatible option combinations.
 */
const productManufacturingConstraintSchema = new mongoose.Schema(
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

    // Physical printable dimension limits (in millimeters)
    maxPrintWidthMm: {
      type: Number,
      required: [true, 'maxPrintWidthMm is required'],
      min: [1, 'maxPrintWidthMm must be at least 1 mm'],
    },
    maxPrintHeightMm: {
      type: Number,
      required: [true, 'maxPrintHeightMm is required'],
      min: [1, 'maxPrintHeightMm must be at least 1 mm'],
    },
    minPrintWidthMm: {
      type: Number,
      default: 10.0,
      min: [1, 'minPrintWidthMm must be at least 1 mm'],
    },
    minPrintHeightMm: {
      type: Number,
      default: 10.0,
      min: [1, 'minPrintHeightMm must be at least 1 mm'],
    },
    maxBleedMm: {
      type: Number,
      default: 5.0,
    },

    // Allowed coordinate boundaries within product template: { minX, minY, maxX, maxY }
    allowedPlacementBounds: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Materials whitelist and blacklist
    availableMaterials: {
      type: [String],
      default: [],
    },
    restrictedMaterials: {
      type: [String],
      default: [],
    },

    // Incompatible option rules:
    // [{ optionA: { name, value }, optionB: { name, value }, reason, suggestedFix }]
    incompatibleOptions: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    // Material & color/finish restrictions:
    // [{ material, disallowedColors: [], disallowedFinishes: [], reason, suggestedFix }]
    restrictedMaterialColors: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    // Print methods supported (e.g. DTG, EMBROIDERY, SCREEN_PRINT, UV_PRINT)
    allowedPrintMethods: {
      type: [String],
      default: ['DTG', 'SCREEN_PRINT'],
    },

    // Method-specific physical constraints
    methodConstraints: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'tbl_ProductManufacturingConstraint',
  },
);

productManufacturingConstraintSchema.index(
  { shop: 1, shopifyProductId: 1, shopifyVariantId: 1 },
  { unique: true },
);

export const ProductManufacturingConstraint =
  mongoose.models.ProductManufacturingConstraint ||
  mongoose.model('ProductManufacturingConstraint', productManufacturingConstraintSchema);

export default ProductManufacturingConstraint;
