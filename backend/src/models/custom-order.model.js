/* eslint-env node */

import mongoose from 'mongoose';

/**
 * CustomOrder Schema for CustomForge
 * Stores customized product orders with production routing assignments, supplier bindings, and workflow tags.
 */
const customOrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: [true, 'orderId is required'],
      unique: true,
      trim: true,
      index: true,
    },
    shopifyOrderId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    customerEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    designId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    // Order customization attributes used for routing evaluation
    productType: {
      type: String,
      trim: true,
      default: null,
    },
    material: {
      type: String,
      trim: true,
      default: null,
    },
    customizationType: {
      type: String,
      trim: true,
      default: null,
    },
    // Production handoff fields
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
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED'],
      default: 'APPROVED',
      index: true,
    },
    handoffStatus: {
      type: String,
      enum: ['PENDING', 'ROUTED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    routedRuleId: {
      type: String,
      default: null,
    },
    routedAt: {
      type: Date,
      default: null,
    },
    shop: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'tbl_CustomOrder',
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

export const CustomOrder =
  mongoose.models.CustomOrder ||
  mongoose.model('CustomOrder', customOrderSchema);

export default CustomOrder;
