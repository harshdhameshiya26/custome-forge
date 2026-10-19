/* eslint-env node */

import mongoose from 'mongoose';

export const SUBSCRIPTION_STATUSES = Object.freeze([
  'ACTIVE',
  'PENDING',
  'CANCELLED',
  'EXPIRED',
]);

const subscriptionSchema = new mongoose.Schema(
  {
    shopDomain: {
      type: String,
      required: [true, 'shopDomain is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    subscriptionId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },
    planName: {
      type: String,
      required: [true, 'planName is required'],
      default: 'Basic',
      trim: true,
    },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: 'PENDING',
      index: true,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    test: {
      type: Boolean,
      default: false,
    },
    price: {
      type: Number,
      default: 0.0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
      trim: true,
    },
    interval: {
      type: String,
      enum: ['EVERY_30_DAYS', 'ANNUAL'],
      default: 'EVERY_30_DAYS',
    },
    confirmationUrl: {
      type: String,
      default: null,
      trim: true,
    },
    trialDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'tbl_Subscription',
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

export const Subscription =
  mongoose.models.Subscription ||
  mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
