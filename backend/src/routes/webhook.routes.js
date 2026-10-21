/* eslint-env node */

import { Router } from 'express';
import { verifyShopifyWebhook } from '../middleware/webhookValidator.js';
import {
  handleOrderCreatedWebhook,
  handleOrderFulfilledWebhook,
  handleOrderCancelledWebhook,
  handleOrderUpdatedWebhook,
  handleOrdersMultiplexer,
} from '../controllers/order.controller.js';
import { handleSubscriptionUpdateWebhook } from '../controllers/billing.controller.js';
import {
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact,
  handleComplianceMultiplexer,
} from '../controllers/compliance.controller.js';

const router = Router();

// =============================================================================
// 1. Order Lifecycle Webhooks
// =============================================================================

/**
 * @route   POST /api/webhooks/orders/create
 * @desc    Catches orders/create Shopify webhooks, verifies HMAC signature,
 *          and initializes custom order timeline to "DESIGN_RECEIVED".
 */
router.post('/orders/create', verifyShopifyWebhook, handleOrderCreatedWebhook);

/**
 * @route   POST /api/webhooks/orders/fulfilled
 * @desc    Catches orders/fulfilled Shopify webhooks, verifies HMAC signature,
 *          and advances custom order timeline to "SHIPPED" (100%).
 */
router.post('/orders/fulfilled', verifyShopifyWebhook, handleOrderFulfilledWebhook);

/**
 * @route   POST /api/webhooks/orders/cancelled
 * @desc    Catches orders/cancelled Shopify webhooks, verifies HMAC signature,
 *          and flags order production as cancelled.
 */
router.post('/orders/cancelled', verifyShopifyWebhook, handleOrderCancelledWebhook);

/**
 * @route   POST /api/webhooks/orders/updated
 * @desc    Catches orders/updated Shopify webhooks, verifies HMAC signature,
 *          and syncs financial/order metadata updates.
 */
router.post('/orders/updated', verifyShopifyWebhook, handleOrderUpdatedWebhook);

/**
 * @route   POST /api/webhooks/orders
 * @desc    Multiplexer endpoint for all order-related webhooks.
 *          Dispatches according to X-Shopify-Topic header.
 */
router.post('/orders', verifyShopifyWebhook, handleOrdersMultiplexer);

// =============================================================================
// 2. Billing & Subscription Webhooks
// =============================================================================

/**
 * @route   POST /api/webhooks/app/subscriptions/update
 * @route   POST /api/webhooks/app/subscriptions_update
 * @desc    Catches app/subscriptions/update Shopify webhooks, verifies HMAC signature,
 *          and syncs the merchant's subscription status in the local database.
 */
router.post(
  '/app/subscriptions/update',
  verifyShopifyWebhook,
  handleSubscriptionUpdateWebhook,
);
router.post(
  '/app/subscriptions_update',
  verifyShopifyWebhook,
  handleSubscriptionUpdateWebhook,
);

// =============================================================================
// 3. Mandatory GDPR / Privacy Compliance Webhooks
// =============================================================================

/**
 * @route   POST /api/webhooks/compliance/customers_data_request
 * @desc    Responds to customer data export requests under GDPR/CCPA.
 */
router.post(
  '/compliance/customers_data_request',
  verifyShopifyWebhook,
  handleCustomersDataRequest,
);

/**
 * @route   POST /api/webhooks/compliance/customers_redact
 * @desc    Responds to customer personal data deletion requests under GDPR/CCPA.
 */
router.post(
  '/compliance/customers_redact',
  verifyShopifyWebhook,
  handleCustomersRedact,
);

/**
 * @route   POST /api/webhooks/compliance/shop_redact
 * @desc    Responds to merchant shop data purge requests 48 hours after uninstall.
 */
router.post(
  '/compliance/shop_redact',
  verifyShopifyWebhook,
  handleShopRedact,
);

/**
 * @route   POST /api/webhooks/compliance
 * @desc    Multiplexer endpoint for all mandatory privacy compliance webhooks.
 *          Dispatches according to X-Shopify-Topic header.
 */
router.post('/compliance', verifyShopifyWebhook, handleComplianceMultiplexer);

export default router;
