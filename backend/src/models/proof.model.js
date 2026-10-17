/* eslint-env node */

import mongoose from 'mongoose';
import crypto from 'node:crypto';

/**
 * Valid proof status enum values matching the Prisma ProofStatus enum.
 */
export const PROOF_STATUSES = Object.freeze([
  'PENDING_APPROVAL',
  'APPROVED',
  'CHANGES_REQUESTED',
]);

/**
 * Single comment entry attached to a proof.
 */
const proofCommentSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: () => crypto.randomUUID(),
    },
    author: {
      type: String,
      required: [true, 'author is required for proof comment'],
      trim: true,
    },
    role: {
      type: String,
      enum: ['CUSTOMER', 'MERCHANT', 'SYSTEM'],
      default: 'CUSTOMER',
    },
    message: {
      type: String,
      required: [true, 'message is required for proof comment'],
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

/**
 * Revision and activity audit entry permanently attached to the proof.
 */
const proofRevisionLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    performedBy: {
      type: String,
      required: true,
      trim: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false },
);

/**
 * Proof Schema (Feature 2 — Proof Approval Before Production)
 * Stores digital proofs, unguessable customer viewing tokens, status,
 * threaded comments, revision audit logs, and production gate flags.
 */
const proofSchema = new mongoose.Schema(
  {
    proofId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomUUID(),
    },
    orderId: {
      type: String,
      required: [true, 'orderId is required'],
      trim: true,
      index: true,
    },
    shopifyOrderId: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    designId: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    versionNumber: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: PROOF_STATUSES,
      default: 'PENDING_APPROVAL',
      required: true,
      index: true,
    },
    secureToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(32).toString('hex'),
    },
    previewUrl: {
      type: String,
      trim: true,
      default: null,
    },
    title: {
      type: String,
      trim: true,
      default: 'Custom Product Design Proof',
    },
    productionBlocked: {
      type: Boolean,
      default: true,
      required: true,
      index: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: String,
      trim: true,
      default: null,
    },
    decisionNote: {
      type: String,
      trim: true,
      default: null,
    },
    comments: {
      type: [proofCommentSchema],
      default: [],
    },
    revisionLogs: {
      type: [proofRevisionLogSchema],
      default: [],
    },
    shop: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'tbl_ProofRecords',
  },
);

// Compound index for quick version lookup per order
proofSchema.index({ orderId: 1, versionNumber: -1 });
proofSchema.index({ shopifyOrderId: 1, versionNumber: -1 });

export const Proof =
  mongoose.models.Proof || mongoose.model('Proof', proofSchema);

export default Proof;
