/* eslint-env node */

import express from 'express';
import {
  registerUser,
  requestOtp,
  verifyOtp,
  loginUser,
  refreshToken,
  getProfile,
  updateProfile,
  logoutUser,
  deleteUser,
  listDirectory,
} from '../controllers/user.controller.js';
import { authenticateUser, requireVerifiedUser } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  registerSchema,
  requestOtpSchema,
  verifyOtpSchema,
  loginSchema,
  updateProfileSchema,
  deleteUserSchema,
  refreshTokenSchema,
} from '../utils/user.validators.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Public routes (no authentication required)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/users/directory
 * Public quick-reference directory of registered Merchants and Suppliers.
 */
router.get('/directory', listDirectory);

/**
 * POST /api/users/register
 * Register a new user account. Issues an OTP to the provided email.
 */
router.post('/register', validate(registerSchema), registerUser);

/**
 * POST /api/users/request-otp
 * (Re-)send a 6-digit OTP to the user's email for verification.
 */
router.post('/request-otp', validate(requestOtpSchema), requestOtp);

/**
 * POST /api/users/verify-otp
 * Submit the 6-digit OTP received via email.
 * On success, marks account as verified and issues access + refresh tokens.
 */
router.post('/verify-otp', validate(verifyOtpSchema), verifyOtp);

/**
 * POST /api/users/login
 * Authenticate with email + password. Returns access + refresh tokens.
 * Rejects unverified accounts with a 403 and prompts OTP flow.
 */
router.post('/login', validate(loginSchema), loginUser);

/**
 * POST /api/users/refresh-token
 * Exchange a valid refresh token for a new access token (+ rotated refresh token).
 */
router.post('/refresh-token', validate(refreshTokenSchema), refreshToken);

// ─────────────────────────────────────────────────────────────────────────────
// Protected routes (authentication required)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/users/profile
 * Return the authenticated user's public profile.
 * Requires: valid access token + verified account.
 */
router.get('/profile', authenticateUser, requireVerifiedUser, getProfile);

/**
 * PATCH /api/users/update-profile
 * Update fullName, email (triggers re-verification), or preferences.
 * Requires: valid access token + verified account.
 */
router.patch(
  '/update-profile',
  authenticateUser,
  requireVerifiedUser,
  validate(updateProfileSchema),
  updateProfile,
);

/**
 * POST /api/users/logout
 * Invalidate the refresh token. Client must discard the access token.
 * Requires: valid access token (verification NOT required — allow logging out even if unverified).
 */
router.post('/logout', authenticateUser, logoutUser);

/**
 * DELETE /api/users/delete
 * Soft-delete the account with password re-confirmation.
 * Requires: valid access token + verified account.
 */
router.delete(
  '/delete',
  authenticateUser,
  requireVerifiedUser,
  validate(deleteUserSchema),
  deleteUser,
);

export default router;
