/* eslint-env node */

import mongoose from 'mongoose';
import crypto from 'node:crypto';

/**
 * RoutingRule Schema for CustomForge
 * Stores criteria (productType, material, customizationType) and targetQueue / supplierId.
 * Used by the production handoff engine to route approved custom orders.
 */
const routingRuleSchema = new mongoose.Schema(
  {
    ruleId: {
      type: String,
      default: () => crypto.randomUUID(),
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'name is required for routing rule'],
      trim: true,
    },
    shop: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      index: true,
    },
    // Matching criteria (case-insensitive normalized)
    productType: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    material: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    customizationType: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    // Destination targets
    targetQueue: {
      type: String,
      required: [true, 'targetQueue is required'],
      trim: true,
      index: true,
    },
    supplierId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    // Order tags automatically applied on matching handoff
    tags: {
      type: [String],
      default: [],
    },
    priority: {
      type: Number,
      default: 100,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'tbl_RoutingRule',
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Compound index for efficient query by active status and priority
routingRuleSchema.index({ isActive: 1, priority: 1 });

export const RoutingRule =
  mongoose.models.RoutingRule ||
  mongoose.model('RoutingRule', routingRuleSchema);

export default RoutingRule;
