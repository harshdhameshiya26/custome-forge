/* eslint-env node */

import { getSubscriptionForShop, normalizeShopDomain, upsertSubscriptionRecord } from '../services/billingService.js';
import { logWarn } from '../utils/logger.js';

/**
 * Express middleware to verify whether a merchant store holds an ACTIVE subscription.
 * Blocks unauthorized access with 403 Forbidden and returns a billing redirect requirement
 * if the subscription is missing, pending, cancelled, or expired.
 */
export const verifyActiveSubscription = async (req, res, next) => {
  try {
    // In development/test environments, permit explicit bypass header for Postman testing
    const isDevOrTest = process.env.NODE_ENV !== 'production';
    if (isDevOrTest && req.get('x-bypass-subscription-check') === 'true') {
      logWarn('⚠️ Subscription check bypassed via "x-bypass-subscription-check" header.');
      return next();
    }

    // Extract shop domain
    const rawShop =
      req.shop ||
      req.get('x-shopify-shop-domain') ||
      req.get('x-shop') ||
      req.query?.shop ||
      (req.body && typeof req.body === 'object' && req.body.shop) ||
      process.env.SHOPIFY_SHOP ||
      process.env.SHOP ||
      'custome-forge.myshopify.com';

    const shopDomain = normalizeShopDomain(rawShop);
    req.shopDomain = shopDomain;

    // Check database for active plan
    const subscription = await getSubscriptionForShop(shopDomain);

    if (!subscription) {
      return res.status(403).json({
        success: false,
        requiresBilling: true,
        code: 'SUBSCRIPTION_REQUIRED',
        message: `Store "${shopDomain}" does not have an active subscription plan. Please select a plan to continue.`,
        shopDomain,
        currentStatus: 'NO_PLAN',
        billingUrl: `/api/billing/create?shop=${encodeURIComponent(shopDomain)}`,
      });
    }

    // Check for period expiration
    if (subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd) < new Date()) {
      if (subscription.status === 'ACTIVE') {
        // Automatically sync state to EXPIRED
        await upsertSubscriptionRecord({
          shopDomain,
          status: 'EXPIRED',
        });
      }

      return res.status(403).json({
        success: false,
        requiresBilling: true,
        code: 'SUBSCRIPTION_EXPIRED',
        message: `Your CustomForge subscription for "${shopDomain}" expired on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}. Please renew your plan.`,
        shopDomain,
        currentStatus: 'EXPIRED',
        billingUrl: `/api/billing/create?shop=${encodeURIComponent(shopDomain)}`,
      });
    }

    // Check active status
    if (subscription.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        requiresBilling: true,
        code: 'SUBSCRIPTION_INACTIVE',
        message: `Subscription for "${shopDomain}" is currently in "${subscription.status}" status. An ACTIVE plan is required.`,
        shopDomain,
        currentStatus: subscription.status,
        confirmationUrl: subscription.confirmationUrl || null,
        billingUrl: `/api/billing/create?shop=${encodeURIComponent(shopDomain)}`,
      });
    }

    // Attach verified subscription details to request object
    req.subscription = subscription;
    req.planName = subscription.planName;
    next();
  } catch (error) {
    logWarn(`⚠️ [verifyActiveSubscription] Error checking subscription: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify merchant billing status.',
      error: error.message,
    });
  }
};

export default verifyActiveSubscription;
