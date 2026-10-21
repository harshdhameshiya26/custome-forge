/* eslint-env node */

import mongoose from 'mongoose';

/**
 * User Schema for CustomForge
 * Supports email/password auth with OTP verification and JWT-based sessions.
 */
const userSchema = new mongoose.Schema(
  {
    // Core identity
    fullName: {
      type: String,
      required: [true, 'fullName is required'],
      trim: true,
      minlength: [2, 'fullName must be at least 2 characters'],
      maxlength: [120, 'fullName must not exceed 120 characters'],
    },
    email: {
      type: String,
      required: [true, 'email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'email must be a valid email address'],
      index: true,
    },

    // Credentials — password hash is never exposed in API responses
    passwordHash: {
      type: String,
      required: [true, 'passwordHash is required'],
      select: false,
    },

    // Verification state
    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },

    // User Role
    role: {
      type: String,
      enum: {
        values: ['customer', 'designer', 'merchant', 'supplier'],
        message: '{VALUE} is not a valid user role (allowed: customer, designer, merchant, supplier)',
      },
      default: 'customer',
      index: true,
    },

    // Supplier Category Specialization (e.g. apparel, leather, drinkware, metal, paper)
    supplierCategory: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // OTP for email verification / re-verification
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
    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Refresh token management — store hashed tokens for invalidation
    refreshTokenHash: {
      type: String,
      default: null,
      select: false,
    },

    // Shopify linkage (optional — set when user is also a Shopify customer)
    shopifyCustomerId: {
      type: String,
      default: null,
      index: true,
    },
    shop: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
      index: true,
    },

    // Profile preferences
    preferences: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Soft-deletion support
    deletedAt: {
      type: Date,
      default: null,
      select: false,
    },

    // Pending email change — set during update-profile if email is being changed
    pendingEmail: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
      select: false,
    },

    // Timestamp of last successful login
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'tbl_users',
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.otp;
        delete ret.otpExpiresAt;
        delete ret.otpAttempts;
        delete ret.refreshTokenHash;
        delete ret.pendingEmail;
        delete ret.deletedAt;
        delete ret.lockUntil;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.otp;
        delete ret.otpExpiresAt;
        delete ret.otpAttempts;
        delete ret.refreshTokenHash;
        delete ret.pendingEmail;
        delete ret.deletedAt;
        delete ret.lockUntil;
        return ret;
      },
    },
  },
);

// Compound index: active (non-deleted) users by email
userSchema.index({ email: 1, deletedAt: 1 });
// Index for shop-scoped user lookups
userSchema.index({ shop: 1, shopifyCustomerId: 1 });

const User = mongoose.models.tbl_User || mongoose.model('tbl_User', userSchema, 'tbl_users');

export default User;
