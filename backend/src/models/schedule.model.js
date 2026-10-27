/* eslint-env node */

import mongoose from 'mongoose';
import crypto from 'node:crypto';

/**
 * Valid Schedule confirmation statuses.
 */
export const SCHEDULE_STATUSES = Object.freeze([
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
]);

/**
 * Schedule Schema for CustomForge
 * Stores supplier production batches linking selected designs to a designated supplier.
 * Finalization requires merchant/owner OTP verification before transitioning to CONFIRMED.
 */
const scheduleSchema = new mongoose.Schema(
  {
    scheduleId: {
      type: String,
      default: () => crypto.randomUUID(),
      unique: true,
      index: true,
    },
    // Supplier account link
    supplierId: {
      type: String,
      required: [true, 'supplierId is required'],
      trim: true,
      index: true,
    },
    supplierEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    supplierName: {
      type: String,
      trim: true,
      default: null,
    },
    // Material or product category specialization (e.g. apparel, leather, drinkware, metal)
    category: {
      type: String,
      required: [true, 'category is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    // Legacy saved-design schedules remain available alongside paid-order schedules.
    designIds: {
      type: [String],
      default: [],
      validate: {
        validator: function (val) {
          return Array.isArray(val);
        },
        message: 'designIds must be an array.',
      },
    },
    orderIds: {
      type: [String],
      default: [],
      validate: {
        validator: function (val) {
          return Array.isArray(val);
        },
        message: 'orderIds must be an array.',
      },
    },
    // Target production schedule timestamp
    scheduledAt: {
      type: Date,
      required: [true, 'scheduledAt is required'],
    },
    // Lifecycle status: PENDING requires merchant OTP confirmation before becoming CONFIRMED
    status: {
      type: String,
      enum: {
        values: SCHEDULE_STATUSES,
        message: '{VALUE} is not a valid schedule status (allowed: PENDING, CONFIRMED, CANCELLED)',
      },
      default: 'PENDING',
      index: true,
    },
    // Merchant who created / approved the schedule
    merchantId: {
      type: String,
      trim: true,
      default: null,
    },
    merchantEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    // OTP verification fields for merchant confirmation
    otp: {
      type: String,
      select: false,
    },
    otpExpiresAt: {
      type: Date,
      select: false,
    },
    otpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    // Audit timestamps
    confirmedAt: {
      type: Date,
      default: null,
    },
    sentToSupplierAt: {
      type: Date,
      default: null,
    },
    supplierEmailSentAt: {
      type: Date,
      default: null,
    },
    supplierEmailStatus: {
      type: String,
      enum: ['pending', 'sending', 'sent', 'failed'],
      default: 'pending',
    },
    supplierEmailSendingAt: {
      type: Date,
      default: null,
    },
    supplierEmailError: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
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
    collection: 'tbl_Schedule',
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        delete ret.otp;
        delete ret.otpExpiresAt;
        delete ret.otpAttempts;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        delete ret.otp;
        delete ret.otpExpiresAt;
        delete ret.otpAttempts;
        return ret;
      },
    },
  },
);

// Compound indexes for fast lookups
scheduleSchema.index({ supplierId: 1, status: 1 });
scheduleSchema.index({ category: 1, status: 1 });
scheduleSchema.index({ createdAt: -1 });

export const Schedule =
  mongoose.models.tbl_Schedule || mongoose.model('tbl_Schedule', scheduleSchema, 'tbl_Schedule');

export default Schedule;
