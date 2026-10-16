/* eslint-env node */

import mongoose from 'mongoose';

/**
 * FeasibilityCheck Schema (Feature 5 — Feasibility Audit Log)
 * Records validation results, blockers, and configuration snapshots.
 */
const feasibilityCheckSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
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

    isFeasible: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PASSED', 'BLOCKED', 'WARNED'],
      default: 'PASSED',
      index: true,
    },

    violations: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    warnings: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    suggestedFixes: {
      type: [String],
      default: [],
    },

    validatedConfig: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    executionTimeMs: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: { createdAt: 'checkedAt', updatedAt: false },
    collection: 'tbl_FeasibilityCheck',
  },
);

export const FeasibilityCheck =
  mongoose.models.FeasibilityCheck ||
  mongoose.model('FeasibilityCheck', feasibilityCheckSchema);

export default FeasibilityCheck;
