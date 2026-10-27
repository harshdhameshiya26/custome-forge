/* eslint-env node */

import crypto from 'node:crypto';
import mongoose from 'mongoose';

/**
 * DesignRevision — immutable snapshot of a design at a given version.
 *
 * Rules enforced here:
 *  - (designId + version) is unique — prevents duplicate version numbers.
 *  - Only one revision per design may have approvedAt set (enforced at
 *    the service layer via a partial index + findOneAndUpdate pattern).
 *  - assetFingerprint is the SHA-256 hex digest of the canonical
 *    JSON.stringify(canvasState) captured at save-time.
 */

const approvalMetaSchema = new mongoose.Schema(
  {
    approvedAt:   { type: Date,   required: true },
    approverId:   { type: String, required: true },   // customerId or staffId
    approverRole: { type: String, required: true },   // 'merchant' | 'supplier' | 'staff'
    ipAddress:    { type: String, default: null },
    userAgent:    { type: String, default: null },
    // fingerprint recorded at approval time for tamper-detection
    fingerprintAtApproval: { type: String, default: null },
  },
  { _id: false },
);

const designRevisionSchema = new mongoose.Schema(
  {
    // ── Ownership ──────────────────────────────────────────────────────────
    designId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    shop: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    // ── Version Sequencing ─────────────────────────────────────────────────
    version: {
      type: Number,
      required: true,
      min: 1,
    },

    // ── Design Snapshot ────────────────────────────────────────────────────
    productId: {
      type: String,
      required: true,
      trim: true,
    },
    productVariantId: {
      type: String,
      trim: true,
      default: null,
    },
    canvasState: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },

    // ── Audit Metadata ─────────────────────────────────────────────────────
    /**
     * SHA-256 hex digest of JSON.stringify(canvasState).
     * Computed at write-time; verified at approval-time.
     */
    assetFingerprint: {
      type: String,
      required: true,
    },

    /** Who triggered this revision: 'merchant' | 'supplier' | 'staff' */
    changedBy: {
      type: String,
      enum: ['merchant', 'supplier', 'staff'],
      required: true,
      default: 'merchant',
    },
    /** Optional free-text note describing what changed in this version */
    changeNote: {
      type: String,
      maxlength: 500,
      default: null,
      trim: true,
    },

    /**
     * Lifecycle status of this specific revision.
     * draft             - auto-saved, not yet submitted for review
     * pending_review    - submitted to merchant for sign-off
     * changes_requested - merchant asked for edits
     * approved          - formally approved (only ONE per design at a time)
     * rejected          - merchant rejected; no further action expected
     * superseded        - a newer approval exists; this one archived
     */
    status: {
      type: String,
      enum: [
        'draft',
        'pending_review',
        'changes_requested',
        'approved',
        'rejected',
        'superseded',
      ],
      default: 'draft',
      index: true,
    },

    /** Populated only when status === 'approved' */
    approvalMeta: {
      type: approvalMetaSchema,
      default: null,
    },

    /** Copied from Design.status at snapshot time for historical accuracy */
    designStatusAtSnapshot: {
      type: String,
      default: null,
    },

    /** ISO timestamp of the original save — separate from Mongoose createdAt */
    savedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'tbl_design_revisions',
  },
);

// ── Indexes ────────────────────────────────────────────────────────────────

// Unique version per design — atomic upsert guard
designRevisionSchema.index({ designId: 1, version: -1 }, { unique: true });
designRevisionSchema.index({
  designId: 1,
  productId: 1,
  productVariantId: 1,
  version: -1,
});

// Fast lookup for "get approved revision of a design"
designRevisionSchema.index(
  { designId: 1, status: 1 },
  { partialFilterExpression: { status: 'approved' } },
);

// ── Static Helpers ─────────────────────────────────────────────────────────

/**
 * Compute SHA-256 fingerprint of a canvas state object.
 * Always sorts keys for deterministic output.
 * @param {object} canvasState
 * @returns {string} hex digest
 */
designRevisionSchema.statics.computeFingerprint = function (canvasState) {
  const canonical = JSON.stringify(canvasState, Object.keys(canvasState ?? {}).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
};

const DesignRevision =
  mongoose.models.tbl_DesignRevision ||
  mongoose.model('tbl_DesignRevision', designRevisionSchema);

export default DesignRevision;
