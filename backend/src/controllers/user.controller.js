/* eslint-env node */

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import User from '../models/user.model.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../utils/jwt.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';
import { sendOtpEmail } from '../services/emailService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 12;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes (600 seconds)
const LOCKOUT_1_HOUR_MS = 60 * 60 * 1000; // 1 hour (60 minutes)
const LOCKOUT_24_HOURS_MS = 24 * 60 * 60 * 1000; // 24 hours (1440 minutes)
const VALID_ROLES = ['merchant', 'supplier', 'designer', 'customer', 'store_owner', 'production_staff'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a cryptographically random 6-digit OTP string. */
const generateOtp = () => String(crypto.randomInt(100000, 999999)).padStart(6, '0');

/** Helper to format remaining lockout time in a human-friendly string. */
const formatLockoutDuration = (lockUntil) => {
  const remainingMs = lockUntil.getTime() - Date.now();
  if (remainingMs <= 0) return '0 seconds';
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const remainingMinutes = Math.ceil(remainingSeconds / 60);
  const remainingHours = Math.ceil(remainingMinutes / 60);

  if (remainingMinutes > 60) {
    return `${remainingHours} hour${remainingHours > 1 ? 's' : ''}`;
  }
  if (remainingMinutes === 60) {
    return '1 hour';
  }
  return `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
};

/**
 * Dispatch an OTP via Nodemailer (emailService).
 * Log delivery failures and propagate them so callers do not report success when
 * the verification code was not sent.
 *
 * @param {string} to       — Recipient email
 * @param {string} otp      — 6-digit code
 * @param {string} fullName — Recipient display name for salutation
 */
const deliverOtp = async (to, otp, fullName = '') => {
  try {
    await sendOtpEmail({ to, otp, fullName, expiryMs: OTP_TTL_MS });
  } catch (err) {
    logError(`[EmailService] OTP delivery failed to ${to}: ${err.message}`);
    throw err;
  }
};

/** Build the safe public token pair response object. */
const buildTokenResponse = (user, accessToken, refreshToken) => ({
  accessToken,
  refreshToken,
  user: user.toJSON(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. POST /users/register
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a new user account.
 * - Validates uniqueness of email (among non-deleted accounts).
 * - Hashes password with bcrypt (12 rounds).
 * - Saves user with isVerified: false.
 * - Immediately issues an OTP to the provided email.
 */
const createUserAccount = async (req, res, next, role) => {
  try {
    const {
      fullName,
      email,
      password,
      category,
      supplierCategory,
      shop,
      shopifyCustomerId,
      preferences,
    } = req.body;

    const resolvedCategory = supplierCategory || category || null;

    if (role === 'supplier' && !resolvedCategory) {
      return res.status(422).json({
        success: false,
        message: 'category specialization is required when registering as a supplier.',
      });
    }

    // Check for existing active account
    const existing = await User.findOne({ email, deletedAt: null });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const otp = generateOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role,
      supplierCategory: resolvedCategory,
      shop: shop || null,
      shopifyCustomerId: shopifyCustomerId || null,
      preferences: preferences || {},
      isVerified: false,
      otp,
      otpExpiresAt,
      otpAttempts: 0,
    });

    await deliverOtp(email, otp, fullName);

    logSuccess(`[registerUser] New ${user.role} registered: ${email}`);

    return res.status(201).json({
      success: true,
      message:
        'Registration successful. A 6-digit verification code has been sent to your email. Please verify your account.',
      data: {
        userId: user._id,
        email: user.email,
        role: user.role,
        supplierCategory: user.supplierCategory,
      },
    });
  } catch (error) {
    logError(`[registerUser] ${error.message}`);
    return next(error);
  }
};

export const registerUser = (req, res, next) => {
  const requestedRole = req.body?.role ? String(req.body.role).toLowerCase().trim() : 'merchant';
  const role = VALID_ROLES.includes(requestedRole) ? requestedRole : 'merchant';
  return createUserAccount(req, res, next, role);
};

// ─────────────────────────────────────────────────────────────────────────────
// 2a. POST /users/request-otp  — (re)send a fresh OTP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request a new OTP for email verification.
 * - Respects active lockouts and blocked status.
 * - Preserves progressive failure attempts across codes.
 */
export const requestOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();

    const user = await User.findOne({
      $or: [{ email: normalizedEmail }, { pendingEmail: normalizedEmail }],
      deletedAt: null,
    }).select('+otp +otpExpiresAt +otpAttempts +lockUntil +isBlocked +pendingEmail');

    if (!user) {
      // Security: do not reveal whether email exists
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a verification code has been sent.',
      });
    }

    if (!VALID_ROLES.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'This account role is no longer permitted to sign in.',
      });
    }

    // 1. Check blocked status
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Account has been permanently blocked. Please register again.',
      });
    }

    // 2. Check active time lock
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingDuration = formatLockoutDuration(user.lockUntil);
      const remainingMs = user.lockUntil.getTime() - Date.now();
      return res.status(400).json({
        success: false,
        message: `Account is temporarily locked. Please try again after ${remainingDuration}.`,
        lockUntil: user.lockUntil,
        remainingSeconds: Math.ceil(remainingMs / 1000),
      });
    }

    // 3. Check if account is already verified (and not undergoing email change)
    if (user.isVerified && !user.pendingEmail) {
      return res.status(400).json({
        success: false,
        message: 'This account is already verified. Please log in directly with your password.',
      });
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    // Note: Do not reset otpAttempts here to preserve progressive failure progression
    await user.save();

    const recipientEmail = user.pendingEmail || user.email;
    await deliverOtp(recipientEmail, otp, user.fullName);

    logSuccess(`[requestOtp] OTP issued for: ${recipientEmail}`);

    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a verification code has been sent.',
    });
  } catch (error) {
    logError(`[requestOtp] ${error.message}`);
    return next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2b. POST /users/verify-otp  — verify the OTP and mark account as verified
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the 6-digit OTP submitted by the user.
 * Progressive failure handling:
 * - Attempt 1 & 2: 400 "Invalid OTP. Please try again or request a new OTP."
 * - Attempt 3: 400 "Too many invalid attempts. Please verify your registration after 1 hour." (lockUntil = 1 hour)
 * - Attempt 4: 400 "Too many invalid attempts. Please verify your registration after 24 hours." (lockUntil = 24 hours)
 * - Attempt 5: 400 "Maximum attempts exceeded. Your account has been permanently blocked and deleted. Please register again." (findByIdAndDelete)
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();

    const user = await User.findOne({
      $or: [{ email: normalizedEmail }, { pendingEmail: normalizedEmail }],
      deletedAt: null,
    }).select(
      '+otp +otpExpiresAt +otpAttempts +lockUntil +isBlocked +passwordHash +refreshTokenHash +pendingEmail',
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address. Please check the spelling or register first.',
      });
    }

    if (!VALID_ROLES.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'This account role is no longer permitted to sign in.',
      });
    }

    // 1. Account block status
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Account has been permanently blocked. Please register again.',
      });
    }

    // 2. Active time lock (lockUntil)
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingMs = user.lockUntil.getTime() - Date.now();
      const remainingDuration = formatLockoutDuration(user.lockUntil);
      return res.status(400).json({
        success: false,
        message: `Account is temporarily locked. Please try again after ${remainingDuration}.`,
        lockUntil: user.lockUntil,
        remainingSeconds: Math.ceil(remainingMs / 1000),
      });
    }

    // 3. Check if account is already verified (and not undergoing email change)
    if (user.isVerified && !user.pendingEmail) {
      return res.status(400).json({
        success: false,
        message: 'This account is already verified. Please log in directly with your password.',
      });
    }

    // 4. OTP expiration (30-second window)
    if (!user.otp || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    // 5. OTP code match (timing-safe comparison)
    const cleanOtp = String(otp || '').trim();
    const cleanUserOtp = String(user.otp || '').trim();
    const otpBuffer = Buffer.from(cleanUserOtp);
    const inputBuffer = Buffer.from(cleanOtp);
    const isMatch =
      otpBuffer.length === inputBuffer.length &&
      crypto.timingSafeEqual(otpBuffer, inputBuffer);

    if (!isMatch) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;

      // Attempt 1 & 2:
      if (user.otpAttempts <= 2) {
        await user.save();
        return res.status(400).json({
          success: false,
          message: 'Invalid OTP. Please try again or request a new OTP.',
          attempts: user.otpAttempts,
        });
      }

      // Attempt 3:
      if (user.otpAttempts === 3) {
        user.lockUntil = new Date(Date.now() + LOCKOUT_1_HOUR_MS);
        user.otp = null;
        user.otpExpiresAt = null;
        await user.save();
        return res.status(400).json({
          success: false,
          message: 'Too many invalid attempts. Please verify your registration after 1 hour.',
          lockUntil: user.lockUntil,
          attempts: user.otpAttempts,
        });
      }

      // Attempt 4:
      if (user.otpAttempts === 4) {
        user.lockUntil = new Date(Date.now() + LOCKOUT_24_HOURS_MS);
        user.otp = null;
        user.otpExpiresAt = null;
        await user.save();
        return res.status(400).json({
          success: false,
          message: 'Too many invalid attempts. Please verify your registration after 24 hours.',
          lockUntil: user.lockUntil,
          attempts: user.otpAttempts,
        });
      }

      // Attempt 5+:
      user.isBlocked = true;
      await User.findByIdAndDelete(user._id);
      logWarn(
        `[verifyOtp] User ${email} (ID: ${user._id}) permanently blocked and deleted after 5 failed OTP attempts.`,
      );
      return res.status(400).json({
        success: false,
        message:
          'Maximum attempts exceeded. Your account has been permanently blocked and deleted. Please register again.',
      });
    }

    // Verification success — reset failure states and issue tokens
    const pendingEmail = user.pendingEmail || null;

    user.isVerified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    user.lockUntil = null;
    user.isBlocked = false;

    if (pendingEmail) {
      user.email = pendingEmail;
      user.pendingEmail = null;
    }

    if (pendingEmail) {
      const refreshToken = crypto.randomBytes(40).toString('base64url');
      user.refreshTokenHash = hashToken(refreshToken);
      user.lastLoginAt = new Date();
    }
    await user.save();

    logSuccess(`[verifyOtp] Email verified for: ${email}`);

    if (!pendingEmail) {
      return res.status(200).json({
        success: true,
        message: 'Email verified successfully. Sign in with your email and password.',
        data: { user: user.toJSON() },
      });
    }

    const accessToken = signAccessToken({
      id: user._id,
      email: user.email,
      role: user.role,
      supplierCategory: user.supplierCategory,
      isVerified: user.isVerified,
    });
    const signedRefreshToken = signRefreshToken({ id: user._id });

    return res.status(200).json({
      success: true,
      message: 'Email updated and verified successfully.',
      data: buildTokenResponse(user, accessToken, signedRefreshToken),
    });
  } catch (error) {
    logError(`[verifyOtp] ${error.message}`);
    return next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /users/login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authenticate an existing user with email + password.
 * - Rejects unverified accounts with a clear prompt.
 * - Issues access + refresh tokens on success.
 */
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, deletedAt: null }).select(
      '+passwordHash +refreshTokenHash +isBlocked +lockUntil',
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Account has been permanently blocked. Please register again.',
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (!VALID_ROLES.includes(user.role)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Account not verified. Please verify your email via OTP.',
        action: 'REQUEST_OTP',
      });
    }

    // Rotate refresh token on each login
    const refreshToken = crypto.randomBytes(40).toString('base64url');
    user.refreshTokenHash = hashToken(refreshToken);
    user.lastLoginAt = new Date();
    await user.save();

    const accessToken = signAccessToken({
      id: user._id,
      email: user.email,
      role: user.role,
      supplierCategory: user.supplierCategory,
      isVerified: user.isVerified,
    });
    const signedRefreshToken = signRefreshToken({ id: user._id });

    logSuccess(`[loginUser] Successful login: ${email}`);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: buildTokenResponse(user, accessToken, signedRefreshToken),
    });
  } catch (error) {
    logError(`[loginUser] ${error.message}`);
    return next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /users/refresh-token
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issue a new access token using a valid refresh token.
 * - Verifies JWT signature AND cross-checks the stored hash.
 * - Rotates the refresh token on each use (refresh token rotation).
 */
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: incomingRefreshToken } = req.body;

    let decoded;
    try {
      decoded = verifyRefreshToken(incomingRefreshToken);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token. Please log in again.',
      });
    }

    const user = await User.findOne({ _id: decoded.id, deletedAt: null }).select(
      '+refreshTokenHash',
    );

    if (
      !user ||
      !VALID_ROLES.includes(user.role) ||
      user.refreshTokenHash !== hashToken(incomingRefreshToken)
    ) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token has been revoked. Please log in again.',
      });
    }

    // Rotate
    const newRawRefreshToken = crypto.randomBytes(40).toString('base64url');
    user.refreshTokenHash = hashToken(newRawRefreshToken);
    await user.save();

    const newAccessToken = signAccessToken({
      id: user._id,
      email: user.email,
      role: user.role,
      supplierCategory: user.supplierCategory,
      isVerified: user.isVerified,
    });
    const newSignedRefreshToken = signRefreshToken({ id: user._id });

    return res.status(200).json({
      success: true,
      message: 'Access token refreshed.',
      data: {
        accessToken: newAccessToken,
        refreshToken: newSignedRefreshToken,
      },
    });
  } catch (error) {
    logError(`[refreshToken] ${error.message}`);
    return next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /users/profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the authenticated user's profile.
 * Requires authenticateUser + requireVerifiedUser middlewares.
 */
export const getProfile = (req, res) => {
  return res.status(200).json({
    success: true,
    data: { user: req.user.toJSON() },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. PATCH /users/update-profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the authenticated user's profile.
 * - If email is changed, the new email is stored in `pendingEmail` and a fresh
 *   OTP is dispatched — account remains verified on the current email until
 *   the OTP is submitted via POST /users/verify-otp.
 * - fullName and preferences are applied immediately.
 */
export const updateProfile = async (req, res, next) => {
  try {
    const { fullName, email, preferences } = req.body;
    const user = await User.findOne({ _id: req.user._id, deletedAt: null }).select(
      '+otp +otpExpiresAt +otpAttempts +pendingEmail',
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    let requiresReVerification = false;

    if (fullName !== undefined) user.fullName = fullName;
    if (preferences !== undefined)
      user.preferences = { ...(user.preferences || {}), ...preferences };

    if (email !== undefined && email !== user.email) {
      // Check uniqueness of the new email
      const emailTaken = await User.findOne({ email, deletedAt: null });
      if (emailTaken) {
        return res.status(409).json({
          success: false,
          message: 'That email address is already in use by another account.',
        });
      }

      // Stage the new email and send OTP
      const otp = generateOtp();
      user.pendingEmail = email;
      user.otp = otp;
      user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
      user.otpAttempts = 0;
      requiresReVerification = true;

      await deliverOtp(email, otp, user.fullName);
    }

    await user.save();

    logSuccess(`[updateProfile] Profile updated for: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: requiresReVerification
        ? 'Profile updated. A verification code has been sent to your new email address. Your email will be updated after verification.'
        : 'Profile updated successfully.',
      data: { user: user.toJSON() },
    });
  } catch (error) {
    logError(`[updateProfile] ${error.message}`);
    return next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. POST /users/logout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log out the authenticated user by invalidating their refresh token.
 * The client is responsible for discarding the access token.
 */
export const logoutUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.user._id, deletedAt: null }).select(
      '+refreshTokenHash',
    );

    if (user) {
      user.refreshTokenHash = null;
      await user.save();
    }

    logSuccess(`[logoutUser] User logged out: ${req.user.email}`);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully. Please discard your access token.',
    });
  } catch (error) {
    logError(`[logoutUser] ${error.message}`);
    return next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. DELETE /users/delete
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Soft-delete the authenticated user account.
 * - Requires password re-confirmation.
 * - Sets deletedAt timestamp and invalidates tokens.
 * - Associated records remain in DB for audit/cascade purposes.
 */
export const deleteUser = async (req, res, next) => {
  try {
    const { password } = req.body;

    const user = await User.findOne({ _id: req.user._id, deletedAt: null }).select(
      '+passwordHash +refreshTokenHash',
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password confirmation failed. Account was not deleted.',
      });
    }

    user.deletedAt = new Date();
    user.refreshTokenHash = null;
    user.otp = null;
    await user.save();

    logSuccess(`[deleteUser] User soft-deleted: ${user.email}`);

    return res.status(200).json({
      success: true,
      message:
        'Your account has been scheduled for deletion. All active sessions have been terminated.',
    });
  } catch (error) {
    logError(`[deleteUser] ${error.message}`);
    return next(error);
  }
};

/**
 * Register a dedicated supplier account with category selection.
 */
export const registerSupplier = async (req, res, next) => {
  return createUserAccount(req, res, next, 'supplier');
};

/**
 * List verified suppliers (filter by category if provided).
 */
export const listSuppliers = async (req, res, next) => {
  try {
    const { category } = req.query;
    const filter = { role: 'supplier', deletedAt: null, isVerified: true, isBlocked: false };
    if (category) {
      filter.supplierCategory = new RegExp(`^${category.trim()}$`, 'i');
    }
    const suppliers = await User.find(filter)
      .select('fullName email role supplierCategory shop lastLoginAt createdAt')
      .sort({ fullName: 1 });

    return res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers,
    });
  } catch (error) {
    logError(`[listSuppliers] ${error.message}`);
    return next(error);
  }
};

/**
 * List Merchants and Suppliers for the quick-reference directory below login.
 */
export const listDirectory = async (req, res, next) => {
  try {
    const { role, category, search } = req.query;
    const filter = { deletedAt: null, isBlocked: false };

    if (role && role !== 'all') {
      filter.role = role.toLowerCase().trim();
    } else {
      filter.role = { $in: ['merchant', 'supplier', 'designer', 'store_owner', 'production_staff'] };
    }

    if (category) {
      filter.supplierCategory = new RegExp(`^${category.trim()}$`, 'i');
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { fullName: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
        { supplierCategory: new RegExp(q, 'i') },
      ];
    }

    const directory = await User.find(filter)
      .select('fullName email role supplierCategory isVerified shop lastLoginAt createdAt')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: directory.length,
      data: directory,
    });
  } catch (error) {
    logError(`[listDirectory] ${error.message}`);
    return next(error);
  }
};

