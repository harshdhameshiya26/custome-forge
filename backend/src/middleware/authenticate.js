/* eslint-env node */

import { verifyAccessToken } from '../utils/jwt.js';
import User from '../models/user.model.js';
import { logError } from '../utils/logger.js';

/**
 * authenticateUser
 * ─────────────────
 * Verifies the Bearer access token in the Authorization header.
 * On success, attaches `req.user` with safe user fields.
 * Returns 401 if the token is missing, invalid, or expired.
 * Returns 404 if the user no longer exists in the DB.
 *
 * Usage:
 *   router.get('/profile', authenticateUser, controller);
 */
export const authenticateUser = async (req, res, next) => {
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

    // Fetch the current user (exclude sensitive fields)
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
        message: 'Account has been permanently blocked. Please register again.',
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    logError(`[authenticateUser] Unexpected error: ${error.message}`);
    return next(error);
  }
};

/**
 * requireVerifiedUser
 * ────────────────────
 * Must be chained AFTER authenticateUser.
 * Returns 403 if the user has not verified their email (isVerified: false).
 *
 * Usage:
 *   router.get('/profile', authenticateUser, requireVerifiedUser, controller);
 */
export const requireVerifiedUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
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

export { verifyRole, requireMerchant, requireDesigner, requireSupplier, requireCustomer } from './auth.middleware.js';

