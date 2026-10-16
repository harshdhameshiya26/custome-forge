/* eslint-env node */

import crypto from 'node:crypto';
import { logWarn, logError } from '../utils/logger.js';

/**
 * Utility function to compute a Shopify-compatible HMAC-SHA256 base64 digest.
 * Useful for automated tests and Postman headers.
 *
 * @param {Buffer|string} payload - Raw request body buffer or JSON string
 * @param {string} secret - Shopify API Secret Key
 * @returns {string} Base64 encoded HMAC-SHA256 signature
 */
export const calculateShopifyHmac = (payload, secret) => {
  const bodyBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  return crypto.createHmac('sha256', secret).update(bodyBuffer).digest('base64');
};

/**
 * Express middleware to verify Shopify webhook HMAC-SHA256 signatures.
 * Protects webhook endpoints against spoofed requests.
 *
 * Postman/Development Friendly:
 * - If in development without SHOPIFY_API_SECRET configured, permits testing with a warning.
 * - Allows `x-bypass-webhook-hmac: true` header in non-production environments.
 */
export const verifyShopifyWebhook = (req, res, next) => {
  const shopifyHmac = req.get('X-Shopify-Hmac-Sha256') || req.get('x-shopify-hmac-sha256');
  const secret = process.env.SHOPIFY_API_SECRET;

  // In non-production, allow explicit testing bypass header for Postman convenience
  const isDevOrTest = process.env.NODE_ENV !== 'production';
  const hasBypassHeader = req.get('x-bypass-webhook-hmac') === 'true';

  if (isDevOrTest && hasBypassHeader) {
    logWarn('⚠️ Webhook HMAC verification bypassed via "x-bypass-webhook-hmac" header.');
    return next();
  }

  if (!secret) {
    if (isDevOrTest) {
      logWarn('⚠️ SHOPIFY_API_SECRET is not configured in .env. Skipping HMAC check in development mode.');
      return next();
    }
    logError('❌ Webhook rejected: SHOPIFY_API_SECRET missing in production.');
    return res.status(500).json({
      success: false,
      message: 'Server configuration error: Webhook secret not configured.',
    });
  }

  if (!shopifyHmac) {
    if (isDevOrTest) {
      logWarn('⚠️ Missing X-Shopify-Hmac-Sha256 header. Allowing request in development for Postman testing.');
      return next();
    }
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Missing X-Shopify-Hmac-Sha256 header.',
    });
  }

  // Retrieve raw buffer (populated by express.json({ verify })) or fallback
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
  const generatedHmac = calculateShopifyHmac(rawBody, secret);

  const hmacBuffer = Buffer.from(shopifyHmac, 'base64');
  const generatedBuffer = Buffer.from(generatedHmac, 'base64');

  if (
    hmacBuffer.length !== generatedBuffer.length ||
    !crypto.timingSafeEqual(hmacBuffer, generatedBuffer)
  ) {
    logError('❌ Invalid Shopify webhook HMAC signature.');
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid Shopify webhook signature.',
    });
  }

  next();
};

export default verifyShopifyWebhook;
