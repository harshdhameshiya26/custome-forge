/* eslint-env node */

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: envPath });

export const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'cf_access_secret_change_in_production';
export const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'cf_refresh_secret_change_in_production';
export const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_TTL || '30d';

/**
 * Role-Based Session Expiration Durations:
 * - Merchant / Store Owner / Designer: 14 days ('14d')
 * - Supplier / Production Staff: 7 days ('7d')
 * - Customer: Standard session expiration ('1d' or '7d', default '1d')
 */
export const ROLE_SESSION_DURATIONS = Object.freeze({
  merchant: '14d',
  store_owner: '14d',
  'store owner': '14d',
  designer: '14d',
  supplier: '7d',
  production_staff: '7d',
  'production staff': '7d',
  production: '7d',
  customer: process.env.JWT_CUSTOMER_TTL || '1d',
});

/**
 * Dynamically resolves JWT expiration duration based on the user role.
 * @param {string} [role]
 * @returns {string}
 */
export const getRoleSessionDuration = (role) => {
  if (!role) return ROLE_SESSION_DURATIONS.customer;
  const normalized = String(role).toLowerCase().trim();
  return ROLE_SESSION_DURATIONS[normalized] || ROLE_SESSION_DURATIONS.customer;
};

/**
 * Sign an access token with dynamic, role-based session expiration:
 * - Merchant / Store Owner / Designer: 14 days ('14d')
 * - Supplier / Production Staff: 7 days ('7d')
 * - Customer: Standard session ('1d')
 *
 * @param {{ id: string, email: string, role?: string, isVerified?: boolean, supplierCategory?: string }} payload
 * @param {import('jsonwebtoken').SignOptions} [options]
 */
export const signAccessToken = (payload, options = {}) => {
  const dynamicTtl = options.expiresIn || getRoleSessionDuration(payload?.role);
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { ...options, expiresIn: dynamicTtl });
};

/**
 * Sign a long-lived refresh token.
 * @param {{ id: string }} payload
 * @param {import('jsonwebtoken').SignOptions} [options]
 */
export const signRefreshToken = (payload, options = {}) =>
  jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_TTL, ...options });

/**
 * Verify an access token. Returns decoded payload or throws JsonWebTokenError/TokenExpiredError.
 * @param {string} token
 */
export const verifyAccessToken = (token) => jwt.verify(token, ACCESS_TOKEN_SECRET);

/**
 * Verify a refresh token. Returns decoded payload or throws JsonWebTokenError/TokenExpiredError.
 * @param {string} token
 */
export const verifyRefreshToken = (token) => jwt.verify(token, REFRESH_TOKEN_SECRET);

/**
 * Hash a token with SHA-256 for safe DB storage.
 * @param {string} token
 */
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export default {
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  REFRESH_TOKEN_TTL,
  ROLE_SESSION_DURATIONS,
  getRoleSessionDuration,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
};
