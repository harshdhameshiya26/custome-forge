/* eslint-env node */

import { verifyAccessToken } from '../utils/jwt.js';
import User from '../models/user.model.js';
import { logError } from '../utils/logger.js';
import OtpService from '../services/otpService.js';

/**
 * Role Normalization Mapping for RBAC verification.
 */
const ROLE_ALIASES = Object.freeze({
  merchant: ['merchant', 'store_owner', 'store owner'],
  store_owner: ['merchant', 'store_owner', 'store owner'],
  'store owner': ['merchant', 'store_owner', 'store owner'],
  supplier: ['supplier', 'production_staff', 'production staff', 'production'],
  production_staff: ['supplier', 'production_staff', 'production staff', 'production'],
  'production staff': ['supplier', 'production_staff', 'production staff', 'production'],
  production: ['supplier', 'production_staff', 'production staff', 'production'],
  designer: ['designer'],
  customer: ['customer'],
});

/**
 * authenticateToken
 * ─────────────────
 * Verifies Bearer JWT access token from Authorization header.
 * Enforces strict 401 "User not logged in" response if token is missing, invalid, or expired.
 * Attaches verified user record to `req.user`.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authorization = req.get('authorization') || req.headers?.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'User not logged in',
        error: 'Unauthorized',
      });
    }

    const token = authorization.slice(7).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'User not logged in',
        error: 'Unauthorized',
      });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'User not logged in',
        error: 'Unauthorized',
      });
    }

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'User not logged in',
        error: 'Unauthorized',
      });
    }

    // Fetch user and ensure account is active and not soft-deleted
    const user = await User.findOne({ _id: decoded.id, deletedAt: null }).select(
      'fullName email role supplierCategory isVerified shopifyCustomerId shop preferences lastLoginAt isBlocked createdAt',
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not logged in',
        error: 'Unauthorized',
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
    return res.status(401).json({
      success: false,
      message: 'User not logged in',
      error: 'Unauthorized',
    });
  }
};

/**
 * Alias for backward compatibility with existing codebase.
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
      message: 'User not logged in',
      error: 'Unauthorized',
    });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Account not verified. Please verify your email before accessing this resource.',
      action: 'REQUEST_OTP',
    });
  }

  return next();
};

/**
 * verifyRole
 * ──────────
 * Role-based authorization middleware factory.
 * Enforces that req.user.role belongs to the specified allowedRoles (supporting aliases).
 *
 * @param {string|string[]} allowedRoles - e.g. ['merchant', 'designer'] or 'supplier'
 * @returns {import('express').RequestHandler}
 */
export const verifyRole = (allowedRoles) => {
  const rawRoles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  const normalizedAllowed = new Set(
    rawRoles.flatMap((r) => {
      const lower = String(r).toLowerCase().trim();
      return ROLE_ALIASES[lower] || [lower];
    }),
  );

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not logged in',
        error: 'Unauthorized',
      });
    }

    const userRole = String(req.user.role || 'customer').toLowerCase().trim();

    if (!normalizedAllowed.has(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Insufficient role permissions.',
        requiredRoles: Array.from(normalizedAllowed),
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
 * sending secure request links, confirming supplier schedules, supplier registration).
 *
 * @param {string} action - Action name ('PROOF_APPROVAL', 'SEND_PROOF_LINK', 'CONFIRM_SCHEDULE', etc.)
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
          message: 'User not logged in',
          error: 'Unauthorized',
        });
      }

      const referenceId = getReferenceIdFn(req);
      const email = req.user.email;
      const otp = req.body?.otp || req.get('x-otp-code') || req.headers?.['x-otp-code'];

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
 * Shortcut middleware combinations for core roles
 */
export const requireMerchant = [authenticateToken, requireVerifiedUser, verifyRole(['merchant', 'store_owner'])];
export const requireSupplier = [authenticateToken, requireVerifiedUser, verifyRole(['supplier', 'production_staff'])];
export const requireDesigner = [authenticateToken, requireVerifiedUser, verifyRole(['designer', 'merchant'])];
export const requireCustomer = [authenticateToken, requireVerifiedUser, verifyRole(['customer', 'merchant'])];
export const requireCoreRole = (roles) => [authenticateToken, requireVerifiedUser, verifyRole(roles)];

export default {
  authenticateToken,
  authenticateUser,
  requireVerifiedUser,
  verifyRole,
  requireActionOtp,
  requireMerchant,
  requireSupplier,
  requireDesigner,
  requireCustomer,
  requireCoreRole,
};
