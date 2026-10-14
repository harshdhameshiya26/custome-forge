/* eslint-env node */

import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Design from '../models/design.model.js';
import GuestSession from '../models/guest-session.model.js';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: envPath });

const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Extracts and normalizes the shop domain from request headers, query, or body.
 * No proxy signature verification is performed.
 */
export const extractShopContext = (request, response, next) => {
  const shop =
    request.get('x-shop') ||
    request.get('x-shopify-shop-domain') ||
    request.query?.shop ||
    (request.body && typeof request.body === 'object' && request.body.shop) ||
    process.env.SHOPIFY_SHOP ||
    process.env.SHOP ||
    'custome-forge.myshopify.com';

  const normalizedShop = typeof shop === 'string' ? shop.toLowerCase().trim() : 'custome-forge.myshopify.com';
  request.shop = normalizedShop;
  request.shopifyProxy = {
    shop: normalizedShop,
    pathPrefix: '/api/designs',
    customerId: null,
  };
  return next();
};

// Pass-through alias for any legacy imports
export const verifyShopifyAppProxy = extractShopContext;

const getBearerToken = (request) => {
  const authorization = request.get('authorization');
  if (!authorization) return null;

  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{30,})$/);
  return match ? match[1] : '';
};

/**
 * Identifies the shopper either via guest session Bearer token, or customer ID.
 */
export const requireShopper = async (request, response, next) => {
  try {
    const bearerToken = getBearerToken(request);
    if (bearerToken === '') {
      return response.status(401).json({
        success: false,
        message: 'Authorization must use a valid guest session bearer token.',
      });
    }

    const shop = request.shop || 'custome-forge.myshopify.com';

    // Allow customer identification via header, query, or body
    const customerId =
      request.get('x-customer-id') ||
      request.query?.customerId ||
      request.query?.logged_in_customer_id ||
      (request.body && typeof request.body === 'object' && request.body.customerId) ||
      null;

    let guestSession = null;
    if (bearerToken) {
      const tokenHash = crypto.createHash('sha256').update(bearerToken).digest('hex');
      guestSession = await GuestSession.findOne({
        tokenHash,
        shop,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      });

      if (!guestSession && !customerId) {
        return response.status(401).json({
          success: false,
          message: 'Guest session is invalid, expired, or revoked.',
        });
      }
    }

    if (customerId) {
      request.shopper = {
        shop,
        customerId: String(customerId).trim(),
        sessionId: guestSession ? guestSession.id : null,
      };
    } else if (guestSession) {
      request.shopper = {
        shop: guestSession.shop,
        customerId: null,
        sessionId: guestSession.id,
      };
    } else {
      return response.status(401).json({
        success: false,
        message: 'A customer ID (via header x-customer-id, query, or body) or guest session Bearer token is required.',
      });
    }

    request.guestSession = guestSession;
    if (request.shopifyProxy) {
      request.shopifyProxy.customerId = request.shopper.customerId;
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireGuestClaim = (request, response, next) => {
  if (!request.shopper?.customerId || !request.guestSession) {
    return response.status(400).json({
      success: false,
      message: 'Claiming guest designs requires both a customer ID and a valid guest session token.',
    });
  }

  return next();
};

export const createGuestSession = async (request, response, next) => {
  try {
    const shop = request.shop || 'custome-forge.myshopify.com';
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
    return next(error);
  }
};

export const revokeGuestSession = async (request, response, next) => {
  try {
    if (request.guestSession) {
      request.guestSession.revokedAt = new Date();
      await request.guestSession.save();
    }

    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
};

export const claimGuestDesigns = async (request, response, next) => {
  try {
    const result = await Design.db.transaction(async (session) => {
      const claimed = await Design.updateMany(
        {
          shop: request.shopper.shop,
          sessionId: request.guestSession.id,
          customerId: null,
        },
        {
          $set: { customerId: request.shopper.customerId, sessionId: null },
        },
        { session },
      );

      request.guestSession.revokedAt = new Date();
      await request.guestSession.save({ session });
      return claimed.modifiedCount;
    });

    return response.status(200).json({
      success: true,
      message: 'Guest designs transferred to the Shopify customer.',
      data: { claimedDesignCount: result },
    });
  } catch (error) {
    return next(error);
  }
};
