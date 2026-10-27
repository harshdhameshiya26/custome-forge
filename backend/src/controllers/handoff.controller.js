/* eslint-env node */

import { processOrderHandoff } from '../services/handoffService.js';
import OtpService from '../services/otpService.js';
import { logError } from '../utils/logger.js';

/**
 * @route   POST /api/orders/handoff/:orderId
 * @desc    Triggers the automated production handoff process for an approved order.
 *          Evaluates order attributes against active routing rules, assigns destination
 *          queue/supplier, updates downstream tags, and records state in MongoDB.
 * @access  Merchant / Internal Automation / Webhook
 */
export const triggerOrderHandoff = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId || !String(orderId).trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ORDER_ID',
          message: 'Parameter "orderId" is required in request path.',
        },
      });
    }

    // 1. Role & Login Guard: User must be logged in with authorized role
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not logged in. Please log in with an authorized role to trigger production handoff.',
        },
      });
    }

    const allowedRoles = ['merchant'];
    const userRole = String(req.user.role || '').toLowerCase().trim();
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_ROLE',
          message: 'Forbidden: Insufficient role permissions. Only merchant or production staff roles are authorized to trigger production handoff.',
          requiredRoles: allowedRoles,
          currentRole: userRole,
        },
      });
    }

    // 2. Sensitive Action Guard: Require explicit email OTP verification
    const inputOtp = req.body?.otp || req.get('x-otp-code');
    if (!inputOtp) {
      const otpSend = await OtpService.generateAndSendOtp({
        email: req.user.email,
        action: 'TRIGGER_HANDOFF',
        referenceId: String(orderId),
        fullName: req.user.fullName || 'Merchant',
      });

      return res.status(403).json({
        success: false,
        requireOtp: true,
        action: 'TRIGGER_HANDOFF',
        message: `OTP verification required before triggering production handoff. A 6-digit confirmation code has been dispatched to ${req.user.email}.`,
        orderId: String(orderId),
        expiresInSeconds: otpSend.expiresInSeconds,
      });
    }

    // Verify OTP code
    await OtpService.verifyOtp({
      email: req.user.email,
      action: 'TRIGGER_HANDOFF',
      referenceId: String(orderId),
      otp: inputOtp,
    });

    const payload = req.body || {};

    const result = await processOrderHandoff(orderId, payload);

    return res.status(200).json({
      success: true,
      message: result.isMatched
        ? `Order successfully routed to queue "${result.assignedQueue}" by rule "${result.matchedRule?.name}".`
        : `Order routed to fallback queue "${result.assignedQueue}" (no specific rule matched).`,
      data: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code || 'HANDOFF_ERROR',
          message: error.message,
          details: error.details || null,
        },
      });
    }

    logError(`❌ [HandoffController] Unexpected error: ${error.message}`);
    next(error);
  }
};

export default {
  triggerOrderHandoff,
};
