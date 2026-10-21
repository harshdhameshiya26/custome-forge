/* eslint-env node */

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: envPath });

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'cf_access_secret_change_in_production';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'cf_refresh_secret_change_in_production';
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_TTL || '7d';

/**
 * Sign a short-lived access token.
 * @param {{ id: string, email: string, isVerified: boolean }} payload
 */
export const signAccessToken = (payload) =>
  jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

/**
 * Sign a long-lived refresh token.
 * @param {{ id: string }} payload
 */
export const signRefreshToken = (payload) =>
  jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_TTL });

/**
 * Verify an access token. Returns decoded payload or throws.
 * @param {string} token
 */
export const verifyAccessToken = (token) => jwt.verify(token, ACCESS_TOKEN_SECRET);

/**
 * Verify a refresh token. Returns decoded payload or throws.
 * @param {string} token
 */
export const verifyRefreshToken = (token) => jwt.verify(token, REFRESH_TOKEN_SECRET);

/**
 * Hash a token with SHA-256 for safe DB storage.
 * @param {string} token
 */
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
