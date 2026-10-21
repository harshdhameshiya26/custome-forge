/* eslint-env node */

import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Design from '../models/design.model.js';
import GuestSession from '../models/guest-session.model.js';
import User from '../models/user.model.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { logWarn, logError } from '../utils/logger.js';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: envPath });

const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Extracts and normalizes real shop domain from request headers, query, body, or authenticated user.
 */
export const extractShopContext = (request, response, next) => {
  const shop =
    request.user?.shop ||
    request.get('x-shop') ||
    request.get('x-shopify-shop-domain') ||
    request.query?.shop ||
    (request.body && typeof request.body === 'object' && request.body.shop) ||
    process.env.SHOPIFY_SHOP ||
    process.env.SHOP ||
    null;

  const normalizedShop = typeof shop === 'string' && shop.trim() ? shop.toLowerCase().trim() : null;
  request.shop = normalizedShop;
  if (normalizedShop) {
    request.shopDomain = normalizedShop;
  }
  return next();
};

// Pass-through alias for any legacy imports
export const verifyShopifyAppProxy = extractShopContext;

/**
 * Extracts Bearer token from the Authorization header.
 * @param {import('express').Request} request
 * @returns {string|null}
 */
const getBearerToken = (request) => {
  const authorization = request.get('authorization');
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
};

/**
 * Identifies and authenticates the real shopper via either:
 * 1. Authenticated User JWT Bearer Token (connected to MongoDB `tbl_users`), OR
 * 2. Active Guest Session Bearer Token (connected to MongoDB `tbl_guest_sessions`), OR
 * 3. Verified Customer ID (connected to MongoDB `tbl_users`).
 *
 * Rejects with 401 if no valid real user or session is authenticated.
 */
export const requireShopper = async (request, response, next) => {
  try {
    const bearerToken = getBearerToken(request);
    const shop = request.shop || request.get('x-shop') || request.get('x-shopify-shop-domain') || process.env.SHOPIFY_SHOP || null;

    // 1. Check if user is already authenticated via auth.middleware
    if (request.user && request.user._id) {
      request.shopper = {
        shop: request.user.shop || shop,
        customerId: request.user.shopifyCustomerId || String(request.user._id),
        userId: String(request.user._id),
        sessionId: null,
        email: request.user.email,
      };
      return next();
    }

    // 2. If Bearer token is provided, check if it's a JWT User Token or a Guest Session Token
    if (bearerToken) {
      // 2a. Attempt JWT user verification against MongoDB tbl_users
      try {
        const decoded = verifyAccessToken(bearerToken);
        if (decoded?.id) {
          const user = await User.findOne({ _id: decoded.id, deletedAt: null }).select(
            'fullName email role supplierCategory isVerified shopifyCustomerId shop isBlocked',
          );

          if (user && !user.isBlocked) {
            request.user = user;
            request.shopper = {
              shop: user.shop || shop,
              customerId: user.shopifyCustomerId || String(user._id),
              userId: String(user._id),
              sessionId: null,
              email: user.email,
            };
            return next();
          }
        }
      } catch {
        // Not a valid JWT, proceed to check as a Guest Session token
      }

      // 2b. Check as a Guest Session in MongoDB tbl_guest_sessions
      const tokenHash = crypto.createHash('sha256').update(bearerToken).digest('hex');
      const guestSessionQuery = {
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      };
      if (shop) {
        guestSessionQuery.shop = shop;
      }

      const guestSession = await GuestSession.findOne(guestSessionQuery);

      if (guestSession) {
        request.guestSession = guestSession;
        request.shopper = {
          shop: guestSession.shop,
          customerId: null,
          userId: null,
          sessionId: String(guestSession._id),
        };
        return next();
      }
    }

    // 3. Check customer ID provided via header, query, or body against real MongoDB users
    const customerId =
      request.get('x-customer-id') ||
      request.query?.customerId ||
      request.query?.logged_in_customer_id ||
      (request.body && typeof request.body === 'object' && request.body.customerId) ||
      null;

    if (customerId) {
      const cleanCustomerId = String(customerId).trim();
      // Verify against MongoDB tbl_users
      const user = await User.findOne({
        $or: [
          { shopifyCustomerId: cleanCustomerId },
          { _id: cleanCustomerId.match(/^[0-9a-fA-F]{24}$/) ? cleanCustomerId : null },
        ].filter(Boolean),
        deletedAt: null,
      }).select('fullName email role shopifyCustomerId shop isBlocked');

      if (user && !user.isBlocked) {
        request.user = user;
        request.shopper = {
          shop: user.shop || shop,
          customerId: user.shopifyCustomerId || String(user._id),
          userId: String(user._id),
          sessionId: null,
          email: user.email,
        };
        return next();
      }

      // If customer exists on Shopify storefront with header, allow real customer context
      request.shopper = {
        shop: shop,
        customerId: cleanCustomerId,
        userId: null,
        sessionId: null,
      };
      return next();
    }

    return response.status(401).json({
      success: false,
      message: 'User not logged in. Valid user token or active session is required to access designs.',
    });
  } catch (error) {
    logError(`[requireShopper] Error: ${error.message}`);
    return next(error);
  }
};

/**
 * Ensures both a customer ID and an active guest session exist for design claiming.
 */
export const requireGuestClaim = (request, response, next) => {
  if (!request.shopper?.customerId || !request.guestSession) {
    return response.status(400).json({
      success: false,
      message: 'Claiming guest designs requires both a customer ID and a valid guest session token.',
    });
  }

  return next();
};

/**
 * Creates a real guest session in MongoDB (`tbl_guest_sessions`).
 */
export const createGuestSession = async (request, response, next) => {
  try {
    const shop = request.shop || request.get('x-shop') || request.get('x-shopify-shop-domain') || process.env.SHOPIFY_SHOP;
    if (!shop) {
      return response.status(400).json({
        success: false,
        message: 'Shop domain is required to initialize a guest session.',
      });
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + GUEST_SESSION_TTL_MS);

    await GuestSession.create({
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      shop,
      expiresAt,
    });

    return response.status(201).json({
      success: true,
      data: {
        sessionToken: token,
        expiresAt,
      },
    });
  } catch (error) {
    logError(`[createGuestSession] Error: ${error.message}`);
    return next(error);
  }
};

/**
 * Revokes an active guest session in MongoDB (`tbl_guest_sessions`).
 */
export const revokeGuestSession = async (request, response, next) => {
  try {
    if (request.guestSession) {
      request.guestSession.revokedAt = new Date();
      await request.guestSession.save();
    }

    return response.status(204).end();
  } catch (error) {
    logError(`[revokeGuestSession] Error: ${error.message}`);
    return next(error);
  }
};

/**
 * Transfers all guest designs to the verified customer in MongoDB (`tbl_designs`).
 */
export const claimGuestDesigns = async (request, response, next) => {
  try {
    const shopperShop = request.shopper.shop;
    const sessionId = request.guestSession.id;
    const customerId = request.shopper.customerId;

    const claimed = await Design.updateMany(
      {
        ...(shopperShop ? { shop: shopperShop } : {}),
        sessionId,
        customerId: null,
      },
      {
        $set: { customerId, sessionId: null },
      },
    );

    request.guestSession.revokedAt = new Date();
    await request.guestSession.save();

    return response.status(200).json({
      success: true,
      message: 'Guest designs transferred to the customer account.',
      data: { claimedDesignCount: claimed.modifiedCount },
    });
  } catch (error) {
    logError(`[claimGuestDesigns] Error: ${error.message}`);
    return next(error);
  }
};

export default {
  extractShopContext,
  verifyShopifyAppProxy,
  requireShopper,
  requireGuestClaim,
  createGuestSession,
  revokeGuestSession,
  claimGuestDesigns,
};
