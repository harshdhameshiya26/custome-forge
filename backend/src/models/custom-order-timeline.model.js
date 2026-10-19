/* eslint-env node */

import mongoose from 'mongoose';

/**
 * Valid stage progression values for custom order manufacturing.
 */
export const ORDER_TIMELINE_STAGES = Object.freeze([
  'DESIGN_RECEIVED',
  'PROOF_READY',
  'APPROVED',
  'IN_PRODUCTION',
  'SHIPPED',
]);

/**
 * Single historical timeline event entry subdocument.
 */
const timelineHistoryEntrySchema = new mongoose.Schema(
  {
    stage: {
      type: String,
      enum: ORDER_TIMELINE_STAGES,
      required: [true, 'stage is required in history entry'],
    },
    message: {
      type: String,
      required: [true, 'message is required in history entry'],
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
 * CustomOrderTimeline Schema (Feature 6 — Custom Order Status Timeline)
 * Stores order progress updates, stage transitions, and reference previews.
 */
const customOrderTimelineSchema = new mongoose.Schema(
  {
    shopifyOrderId: {
      type: String,
      required: [true, 'shopifyOrderId is required'],
      unique: true,
      trim: true,
    },
    customerEmail: {
      type: String,
      required: [true, 'customerEmail is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    currentStage: {
      type: String,
      enum: ORDER_TIMELINE_STAGES,
      default: 'DESIGN_RECEIVED',
      required: true,
      index: true,
    },
    assignedQueue: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    supplierId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    history: {
      type: [timelineHistoryEntrySchema],
      default: [],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    shop: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'tbl_CustomOrderTimeline',
  },
);

export const CustomOrderTimeline =
  mongoose.models.CustomOrderTimeline ||
  mongoose.model('CustomOrderTimeline', customOrderTimelineSchema);

export default CustomOrderTimeline;
