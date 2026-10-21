/* eslint-env node */

import crypto from 'node:crypto';
import ActionOtp, { SENSITIVE_ACTIONS } from '../models/action-otp.model.js';
import { sendOtpEmail } from './emailService.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

/**
 * Generate a cryptographically secure 6-digit OTP string.
 */
export const generate6DigitCode = () =>
  String(crypto.randomInt(100000, 999999)).padStart(6, '0');

/**
 * Hash an OTP code with SHA-256 for safe database storage.
 */
export const hashOtp = (code) =>
  crypto.createHash('sha256').update(String(code).trim()).digest('hex');

/**
 * Friendly action descriptions for email notifications.
 */
const ACTION_DESCRIPTIONS = {
  PROOF_APPROVAL: 'approving the custom product proof and releasing the order for manufacturing',
  SEND_PROOF_LINK: 'generating and dispatching the customer proof review link',
  CONFIRM_SCHEDULE: 'confirming the supplier production schedule and transferring design files',
  CRITICAL_ACTION: 'authorizing this sensitive customization operation',
};

/**
 * Service to manage secure email OTPs for sensitive actions.
 */
export class OtpService {
  /**
   * Generate and send an OTP for a sensitive action to a registered email.
   *
   * @param {Object} params
   * @param {string} params.email - Registered email address
   * @param {string} params.action - One of SENSITIVE_ACTIONS
   * @param {string} [params.referenceId] - e.g. proofId, scheduleId, orderId
   * @param {string} [params.fullName] - User full name
   * @param {Object} [params.metadata] - Extra context
   * @returns {Promise<Object>}
   */
  static async generateAndSendOtp({ email, action, referenceId = null, fullName = 'Valued Partner', metadata = {} }) {
    if (!email || !String(email).trim()) {
      const err = new Error('Email address is required for OTP delivery.');
      err.statusCode = 400;
      throw err;
    }

    if (!SENSITIVE_ACTIONS.includes(action)) {
      const err = new Error(`Invalid sensitive action "${action}". Allowed: ${SENSITIVE_ACTIONS.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanRef = referenceId ? String(referenceId).trim() : null;

    // Invalidate any existing unconsumed OTPs for this action/reference
    await ActionOtp.updateMany(
      { email: cleanEmail, action, referenceId: cleanRef, isConsumed: false },
      { $set: { isConsumed: true } },
    );

    const rawOtp = generate6DigitCode();
    const otpHash = hashOtp(rawOtp);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

    await ActionOtp.create({
      email: cleanEmail,
      action,
      referenceId: cleanRef,
      otpHash,
      otpExpiresAt,
      attempts: 0,
      isConsumed: false,
      metadata: {
        ...metadata,
        actionDescription: ACTION_DESCRIPTIONS[action] || action,
      },
    });

    // Dispatch email
    const actionDesc = ACTION_DESCRIPTIONS[action] || 'authorizing this action';
    await sendOtpEmail({
      to: cleanEmail,
      otp: rawOtp,
      fullName,
      expiryMs: OTP_TTL_MS,
    }).catch((emailErr) => {
      logError(`[OtpService] Failed to send email to ${cleanEmail}: ${emailErr.message}`);
    });

    logSuccess(`[OtpService] Action OTP generated for ${cleanEmail} (Action: ${action}, Ref: ${cleanRef || 'none'})`);

    return {
      success: true,
      message: `A 6-digit confirmation code has been dispatched to ${cleanEmail} for ${actionDesc}.`,
      action,
      referenceId: cleanRef,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      expiresAt: otpExpiresAt,
    };
  }

  /**
   * Verify an action OTP.
   *
   * @param {Object} params
   * @param {string} params.email
   * @param {string} params.action
   * @param {string} [params.referenceId]
   * @param {string} params.otp - 6-digit code entered by user
   * @returns {Promise<{ verified: boolean, message: string }>}
   */
  static async verifyOtp({ email, action, referenceId = null, otp }) {
    if (!email || !otp) {
      const err = new Error('Both email and OTP code are required for verification.');
      err.statusCode = 400;
      throw err;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanRef = referenceId ? String(referenceId).trim() : null;
    const cleanOtp = String(otp).trim();

    const record = await ActionOtp.findOne({
      email: cleanEmail,
      action,
      ...(cleanRef ? { referenceId: cleanRef } : {}),
      isConsumed: false,
    }).sort({ createdAt: -1 });

    if (!record) {
      const err = new Error('No active confirmation code found for this action. Please request a new code.');
      err.statusCode = 400;
      throw err;
    }

    // Check expiration
    if (record.otpExpiresAt < new Date()) {
      record.isConsumed = true;
      await record.save();
      const err = new Error('The confirmation code has expired. Please request a new code.');
      err.statusCode = 400;
      throw err;
    }

    // Check attempts limit
    if (record.attempts >= MAX_ATTEMPTS) {
      record.isConsumed = true;
      await record.save();
      const err = new Error('Maximum verification attempts exceeded. Please request a new code.');
      err.statusCode = 429;
      throw err;
    }

    // Compare hash
    const inputHash = hashOtp(cleanOtp);
    const storedHash = record.otpHash;

    const isMatch =
      inputHash.length === storedHash.length &&
      crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));

    if (!isMatch) {
      record.attempts += 1;
      await record.save();
      const remaining = Math.max(0, MAX_ATTEMPTS - record.attempts);
      const err = new Error(`Invalid confirmation code. ${remaining} attempts remaining.`);
      err.statusCode = 400;
      throw err;
    }

    // Mark as consumed
    record.isConsumed = true;
    await record.save();

    logSuccess(`[OtpService] Action OTP successfully verified for ${cleanEmail} (Action: ${action})`);

    return {
      verified: true,
      message: 'Confirmation code successfully verified.',
    };
  }
}

export default OtpService;
