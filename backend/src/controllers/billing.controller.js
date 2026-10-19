/* eslint-env node */

import {
  createAppSubscription,
  verifyAndActivateSubscription,
  cancelAppSubscription,
  syncSubscriptionFromWebhook,
  getSubscriptionForShop,
  normalizeShopDomain,
  DEFAULT_PLANS,
} from '../services/billingService.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';

/**
 * Extracts normalized shop domain from request.
 */
const getRequestShop = (req) => {
  const raw =
    req.shopDomain ||
    req.shop ||
    req.get('x-shopify-shop-domain') ||
    req.get('x-shop') ||
    req.query?.shop ||
    (req.body && typeof req.body === 'object' && req.body.shop) ||
    process.env.SHOPIFY_SHOP ||
    process.env.SHOP ||
    'custome-forge.myshopify.com';

  return normalizeShopDomain(raw);
};

/**
 * @route   POST /api/billing/create
 * @desc    Creates a new Shopify recurring app subscription charge via GraphQL.
 *          Returns the confirmationUrl for merchant approval.
 * @access  Merchant Admin
 */
export const createSubscription = async (req, res, next) => {
  try {
    const shop = getRequestShop(req);
    const body = req.body || {};

    let {
      planName = 'Pro',
      price,
      interval = 'EVERY_30_DAYS',
      trialDays,
      returnUrl,
      test,
    } = body;

    // Normalize plan details from presets if price not given
    const upperPlan = String(planName).toUpperCase();
    if (DEFAULT_PLANS[upperPlan]) {
      price = price !== undefined ? Number(price) : DEFAULT_PLANS[upperPlan].price;
      trialDays = trialDays !== undefined ? Number(trialDays) : DEFAULT_PLANS[upperPlan].trialDays;
      interval = interval || DEFAULT_PLANS[upperPlan].interval;
    } else {
      price = Number(price) || 29.99;
      trialDays = Number(trialDays) || 0;
    }

    const host = req.get('host') || 'localhost:5000';
    const protocol = req.protocol || 'http';
    const accessToken = req.get('x-shopify-access-token') || null;

    const result = await createAppSubscription({
      shopDomain: shop,
      planName,
      price,
      interval,
      trialDays,
      returnUrl,
      test,
      accessToken,
      host,
      protocol,
    });

    return res.status(200).json({
      success: true,
      message: 'Subscription charge created successfully. Redirect merchant to confirmationUrl for approval.',
      data: result,
    });
  } catch (error) {
    logError(`❌ [BillingController] createSubscription error: ${error.message}`);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code || 'BILLING_CREATE_FAILED',
          message: error.message,
          details: error.details || null,
        },
      });
    }
    next(error);
  }
};

/**
 * @route   GET /api/billing/callback
 * @desc    Handles return redirect from Shopify after merchant approves or declines a charge.
 *          Verifies charge status via GraphQL, activates subscription in DB, and redirects
 *          merchant back to embedded app or returns JSON.
 * @access  Shopify Redirect / Merchant
 */
export const handleBillingCallback = async (req, res, next) => {
  try {
    const shop = getRequestShop(req);
    const chargeId = req.query.charge_id || req.query.subscription_id || req.query.id;
    const accessToken = req.get('x-shopify-access-token') || null;

    if (!chargeId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CHARGE_ID',
          message: 'Query parameter "charge_id" is required on billing callback.',
        },
      });
    }

    const result = await verifyAndActivateSubscription({
      shopDomain: shop,
      chargeId,
      accessToken,
    });

    // Check if client prefers JSON (e.g. Postman, API automated test)
    const acceptsJson =
      req.xhr ||
      req.get('accept')?.includes('application/json') ||
      req.query.format === 'json';

    if (acceptsJson) {
      return res.status(200).json({
        success: true,
        message: result.isActive
          ? `Subscription successfully activated for store "${shop}".`
          : `Subscription verification completed with status "${result.status}".`,
        data: result,
      });
    }

    // Interactive browser redirect to embedded app dashboard
    const apiKey = process.env.SHOPIFY_API_KEY || '';
    const redirectUrl = `https://${shop}/admin/apps/${apiKey}?billing=${result.status.toLowerCase()}`;
    return res.redirect(redirectUrl);
  } catch (error) {
    logError(`❌ [BillingController] handleBillingCallback error: ${error.message}`);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code || 'BILLING_CALLBACK_FAILED',
          message: error.message,
        },
      });
    }
    next(error);
  }
};

/**
 * @route   POST /api/billing/cancel
 * @desc    Cancels the active Shopify app subscription charge via GraphQL and marks it CANCELLED.
 * @access  Merchant Admin
 */
export const cancelSubscription = async (req, res, next) => {
  try {
    const shop = getRequestShop(req);
    const { subscriptionId, prorate = true } = req.body || {};
    const accessToken = req.get('x-shopify-access-token') || null;

    const result = await cancelAppSubscription({
      shopDomain: shop,
      subscriptionId,
      prorate,
      accessToken,
    });

    return res.status(200).json({
      success: true,
      message: `Subscription successfully cancelled for store "${shop}".`,
      data: result,
    });
  } catch (error) {
    logError(`❌ [BillingController] cancelSubscription error: ${error.message}`);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code || 'BILLING_CANCEL_FAILED',
          message: error.message,
        },
      });
    }
    next(error);
  }
};

/**
 * @route   GET /api/billing/status
 * @desc    Retrieves the current subscription plan and billing status for a shop.
 * @access  Merchant Admin
 */
export const getBillingStatus = async (req, res, next) => {
  try {
    const shop = getRequestShop(req);
    const subscription = await getSubscriptionForShop(shop);

    if (!subscription) {
      return res.status(200).json({
        success: true,
        shopDomain: shop,
        hasSubscription: false,
        status: 'NO_PLAN',
        availablePlans: DEFAULT_PLANS,
      });
    }

    const isExpired =
      subscription.currentPeriodEnd &&
      new Date(subscription.currentPeriodEnd) < new Date();

    return res.status(200).json({
      success: true,
      shopDomain: shop,
      hasSubscription: true,
      data: {
        ...subscription,
        isActive: subscription.status === 'ACTIVE' && !isExpired,
        isExpired,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/webhooks/app/subscriptions/update
 * @desc    Shopify webhook handler for "app/subscriptions/update".
 *          HMAC verified, syncs local database state when charges change status.
 * @access  Shopify Webhook Service (HMAC verified)
 */
export const handleSubscriptionUpdateWebhook = async (req, res, next) => {
  try {
    const payload = req.body || {};
    const shop =
      req.get('X-Shopify-Shop-Domain') ||
      req.get('x-shopify-shop-domain') ||
      payload.shop_domain ||
      payload.shop ||
      'custome-forge.myshopify.com';

    logSuccess(`🔔 [Billing Webhook] Received app/subscriptions/update for ${shop}`);

    const updatedSubscription = await syncSubscriptionFromWebhook(payload, shop);

    return res.status(200).json({
      success: true,
      received: true,
      message: 'Subscription webhook processed and local database updated.',
      data: updatedSubscription,
    });
  } catch (error) {
    logError(`❌ [Billing Webhook] Error processing subscription update: ${error.message}`);
    // Respond 200 or 500 depending on recoverable state
    return res.status(500).json({
      success: false,
      message: 'Error processing subscription webhook.',
      error: error.message,
    });
  }
};

export default {
  createSubscription,
  handleBillingCallback,
  cancelSubscription,
  getBillingStatus,
  handleSubscriptionUpdateWebhook,
};
