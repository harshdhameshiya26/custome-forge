/* eslint-env node */

import mongoose from 'mongoose';

/**
 * Polaris-inspired notification categories & severity levels
 * aligned with Shopify App Store UX and developer platform standards.
 */
export const NOTIFICATION_TYPES = Object.freeze([
  'BILLING_CHANGE',
  'SUBSCRIPTION_CANCELLED',
  'FEATURE_ERROR',
  'SYSTEM_ALERT',
  'ORDER_UPDATE',
]);

export const NOTIFICATION_SEVERITIES = Object.freeze([
  'INFO',
  'SUCCESS',
  'WARNING',
  'ERROR',
]);

const notificationSchema = new mongoose.Schema(
  {
    shopDomain: {
      type: String,
      required: [true, 'shopDomain is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      enum: NOTIFICATION_TYPES,
      index: true,
    },
    severity: {
      type: String,
      required: [true, 'Notification severity is required'],
      enum: NOTIFICATION_SEVERITIES,
      default: 'INFO',
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [255, 'Notification title cannot exceed 255 characters'],
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'Notification',
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Compound indexes for fast top-right slide-in dropdown queries and unread counting
notificationSchema.index({ shopDomain: 1, read: 1 });
notificationSchema.index({ shopDomain: 1, createdAt: -1 });

export const Notification =
  mongoose.models.Notification ||
  mongoose.model('Notification', notificationSchema);

export default Notification;
