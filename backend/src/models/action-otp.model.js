/* eslint-env node */

import mongoose from 'mongoose';

/**
 * Valid sensitive action types requiring explicit email OTP verification.
 */
export const SENSITIVE_ACTIONS = Object.freeze([
  'PROOF_APPROVAL',
  'SEND_PROOF_LINK',
  'SEND_SECURE_FILE',
  'SEND_SECURE_LINK',
  'SEND_SECURE_REQUEST',
  'CONFIRM_SCHEDULE',
  'SUPPLIER_REGISTRATION',
  'CRITICAL_ACTION',
  'TRIGGER_HANDOFF',
  'REVISION_APPROVAL',
  'FEEDBACK_APPROVAL',
  'LIBRARY_MANAGE',
]);

const actionOtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'email is required for action OTP'],
      lowercase: true,
      trim: true,
      index: true,
    },
    action: {
      type: String,
      required: [true, 'action type is required'],
      enum: SENSITIVE_ACTIONS,
      index: true,
    },
    referenceId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: [true, 'otpHash is required'],
    },
    otpExpiresAt: {
      type: Date,
      required: [true, 'otpExpiresAt is required'],
    },
    attempts: {
      type: Number,
      default: 0,
    },
    isConsumed: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'tbl_ActionOtps',
  },
);

// MongoDB TTL index: automatically prune documents when otpExpiresAt passes
actionOtpSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 3600 });
// Compound index for quick lookup
actionOtpSchema.index({ email: 1, action: 1, referenceId: 1, isConsumed: 1 });

export const ActionOtp =
  mongoose.models.tbl_ActionOtp || mongoose.model('tbl_ActionOtp', actionOtpSchema, 'tbl_ActionOtps');

export default ActionOtp;
