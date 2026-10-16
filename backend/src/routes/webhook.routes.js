/* eslint-env node */

import { Router } from 'express';
import { verifyShopifyWebhook } from '../middleware/webhookValidator.js';
import { handleOrderCreatedWebhook } from '../controllers/order.controller.js';

const router = Router();

/**
 * @route   POST /api/webhooks/orders/create
 * @desc    Catches orders/create Shopify webhooks, verifies HMAC signature,
 *          and initializes custom order timeline to "DESIGN_RECEIVED".
 * @access  Shopify Webhook Service (HMAC-SHA256 verified)
 * @headers X-Shopify-Hmac-Sha256: <base64-hmac-sha256>
 *          X-Shopify-Topic: orders/create
 *          X-Shopify-Shop-Domain: <shop.myshopify.com>
 */
router.post('/orders/create', verifyShopifyWebhook, handleOrderCreatedWebhook);

export default router;
