/* eslint-env node */

import { verifyAccessToken } from '../utils/jwt.js';
import User from '../models/user.model.js';
import { logError } from '../utils/logger.js';
import OtpService from '../services/otpService.js';

/**
 * authenticateToken
 * ─────────────────
 * Verifies Bearer JWT access token from Authorization header.
 * Enforces strict 401 "User not logged in" response if token is missing or invalid.
 * Attaches verified user record to `req.user`.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authorization = req.get('authorization');
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'User not logged in. Access token is missing. Please log in.',
      });
    }

    const token = authorization.slice(7).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'User not logged in. Access token is empty. Please log in.',
      });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      const isExpired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        success: false,
        message: isExpired
          ? 'User not logged in. Access token has expired. Please refresh your session.'
          : 'User not logged in. Access token is invalid. Please log in again.',
      });
    }

    // Fetch user and ensure account is active
    const user = await User.findOne({ _id: decoded.id, deletedAt: null }).select(
      'fullName email role supplierCategory isVerified shopifyCustomerId shop preferences lastLoginAt isBlocked createdAt',
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not logged in. User associated with this token no longer exists.',
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Account has been permanently blocked. Please contact support.',
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    logError(`[authenticateToken] Unexpected error: ${error.message}`);
    return next(error);
  }
};

/**
 * Alias for backward compatibility with existing code.
 */
export const authenticateUser = authenticateToken;

/**
 * requireVerifiedUser
 * ────────────────────
 * Ensures that the authenticated user has verified their account (via OTP).
 */
export const requireVerifiedUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User not logged in. Authentication required.',
    });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Account not verified. Please verify your email before accessing this resource.',
    });
  }

  return next();
};

/**
 * verifyRole
 * ──────────
 * Role-based authorization middleware factory.
 * Enforces that req.user.role belongs to the specified allowedRoles.
 *
 * @param {string|string[]} allowedRoles - e.g. ['merchant', 'designer'], or 'supplier'
 * @returns {import('express').RequestHandler}
 */
export const verifyRole = (allowedRoles) => {
  const roles = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]).map((r) =>
    String(r).toLowerCase().trim(),
  );

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not logged in. Authentication required. Please provide a valid Bearer token.',
      });
    }

    const userRole = String(req.user.role || 'customer').toLowerCase().trim();

    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Insufficient role permissions.',
        requiredRoles: roles,
        currentRole: userRole,
      });
    }

    return next();
  };
};

/**
 * requireActionOtp
 * ────────────────
 * Enforces email OTP verification for sensitive operations (proof approvals,
 * sending secure request links, confirming supplier schedules).
 *
 * @param {string} action - Action name ('PROOF_APPROVAL', 'SEND_PROOF_LINK', 'CONFIRM_SCHEDULE')
 * @param {Function} [getReferenceIdFn] - Function extracting reference ID from request
 */
export const requireActionOtp = (
  action,
  getReferenceIdFn = (req) =>
    req.params?.proofId || req.params?.scheduleId || req.params?.id || req.body?.referenceId,
) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not logged in. Authentication required for sensitive actions.',
        });
      }

      const referenceId = getReferenceIdFn(req);
      const email = req.user.email;
      const otp = req.body?.otp || req.get('x-otp-code');

      // If OTP code is not provided, automatically generate and dispatch to registered email
      if (!otp) {
        const sendResult = await OtpService.generateAndSendOtp({
          email,
          action,
          referenceId,
          fullName: req.user.fullName,
        });

        return res.status(403).json({
          success: false,
          requireOtp: true,
          message: `OTP verification required before finalizing this action. A 6-digit confirmation code has been dispatched to your registered email (${email}).`,
          action,
          referenceId,
          expiresInSeconds: sendResult.expiresInSeconds,
        });
      }

      // Verify OTP code
      await OtpService.verifyOtp({
        email,
        action,
        referenceId,
        otp,
      });

      return next();
    } catch (error) {
      logError(`[requireActionOtp] ${error.message}`);
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
      });
    }
  };
};

/**
 * Shortcut middleware combinations
 */
export const requireMerchant = [authenticateToken, requireVerifiedUser, verifyRole(['merchant'])];
export const requireDesigner = [authenticateToken, requireVerifiedUser, verifyRole(['designer', 'merchant'])];
export const requireSupplier = [authenticateToken, requireVerifiedUser, verifyRole(['supplier'])];
export const requireCustomer = [authenticateToken, requireVerifiedUser, verifyRole(['customer', 'merchant'])];

export default {
  authenticateToken,
  authenticateUser,
  requireVerifiedUser,
  verifyRole,
  requireActionOtp,
  requireMerchant,
  requireDesigner,
  requireSupplier,
  requireCustomer,
};
