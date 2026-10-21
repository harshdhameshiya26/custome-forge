/* eslint-env node */

import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import Subscription from '../models/subscription.model.js';
import { createNotification } from './notificationService.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

/**
 * Standard tier configuration defaults for CustomForge
 */
export const DEFAULT_PLANS = Object.freeze({
  BASIC: {
    name: 'Basic',
    price: 9.99,
    interval: 'EVERY_30_DAYS',
    trialDays: 7,
  },
  PRO: {
    name: 'Pro',
    price: 29.99,
    interval: 'EVERY_30_DAYS',
    trialDays: 14,
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 99.99,
    interval: 'EVERY_30_DAYS',
    trialDays: 30,
  },
});

/**
 * Normalizes shop domain strings (e.g. "my-store.myshopify.com").
 */
export const normalizeShopDomain = (rawShop) => {
  if (!rawShop) return process.env.SHOPIFY_SHOP || '';
  let shop = String(rawShop).trim().toLowerCase();
  shop = shop.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!shop.includes('.')) {
    shop = `${shop}.myshopify.com`;
  }
  return shop;
};

/**
 * Normalizes Shopify subscription GID or numeric ID into a full GID.
 * e.g. "12345678" -> "gid://shopify/AppSubscription/12345678"
 */
export const normalizeSubscriptionId = (rawId) => {
  if (!rawId) return null;
  const str = String(rawId).trim();
  if (str.startsWith('gid://shopify/AppSubscription/')) return str;
  const numericMatch = str.match(/\d+/);
  return numericMatch ? `gid://shopify/AppSubscription/${numericMatch[0]}` : str;
};

/**
 * Maps Shopify API subscription status values to internal SubscriptionStatus enum.
 * Values from Shopify: "ACCEPTED", "ACTIVE", "CANCELLED", "DECLINED", "EXPIRED", "FROZEN", "PENDING"
 */
export const mapShopifyStatus = (shopifyStatus) => {
  const s = String(shopifyStatus || '').toUpperCase();
  switch (s) {
    case 'ACTIVE':
    case 'ACCEPTED':
      return 'ACTIVE';
    case 'PENDING':
      return 'PENDING';
    case 'CANCELLED':
    case 'DECLINED':
      return 'CANCELLED';
    case 'EXPIRED':
    case 'FROZEN':
      return 'EXPIRED';
    default:
      return 'PENDING';
  }
};

/**
 * Retrieves the offline Admin API access token for a merchant shop.
 * Searches database tbl_Session or environment configurations.
 */
export const getShopAccessToken = async (shopDomain) => {
  const shop = normalizeShopDomain(shopDomain);

  // 1. Check if token is explicitly supplied via environment
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  }

  // 2. Query Prisma tbl_Session (Shopify App Session Storage)
  if (prisma?.tbl_Session) {
    try {
      const session = await prisma.tbl_Session.findFirst({
        where: {
          OR: [
            { id: `offline_${shop}` },
            { shop: shop, isOnline: false },
            { shop: shop },
          ],
        },
        orderBy: { expires: 'desc' },
      });
      if (session?.accessToken) return session.accessToken;
    } catch (err) {
      logWarn(`⚠️ Prisma tbl_Session lookup warning: ${err.message}`);
    }
  }

  return null;
};

/**
 * Executes a GraphQL query/mutation against the Shopify Admin GraphQL API.
 */
export const executeShopifyGraphQL = async ({
  shop,
  accessToken,
  query,
  variables = {},
}) => {
  const normalizedShop = normalizeShopDomain(shop);
  const token = accessToken || (await getShopAccessToken(normalizedShop));

  if (!token) {
    const err = new Error(
      `No valid Shopify access token found for store "${normalizedShop}". Store must complete OAuth installation.`,
    );
    err.statusCode = 401;
    err.code = 'NO_SHOPIFY_ACCESS_TOKEN';
    throw err;
  }

  const endpoint = `https://${normalizedShop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      'User-Agent': 'CustomForge-Billing/1.0',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Shopify GraphQL HTTP error (${response.status}): ${errorText}`);
    error.statusCode = response.status;
    throw error;
  }

  const json = await response.json();
  if (json.errors && json.errors.length > 0) {
    const errorMsg = json.errors.map((e) => e.message).join('; ');
    const err = new Error(`Shopify GraphQL error: ${errorMsg}`);
    err.statusCode = 400;
    err.details = json.errors;
    throw err;
  }

  return json.data;
};

/**
 * Persists or updates the Subscription record in Prisma with Mongoose fallback.
 */
export const upsertSubscriptionRecord = async (data) => {
  const shopDomain = normalizeShopDomain(data.shopDomain);

  // 1. Try Prisma first
  if (prisma?.subscription) {
    try {
      return await prisma.subscription.upsert({
        where: { shopDomain },
        update: {
          subscriptionId: data.subscriptionId || undefined,
          planName: data.planName || undefined,
          status: data.status || undefined,
          currentPeriodEnd: data.currentPeriodEnd || undefined,
          test: data.test !== undefined ? data.test : undefined,
          price: data.price !== undefined ? data.price : undefined,
          currency: data.currency || undefined,
          interval: data.interval || undefined,
          confirmationUrl: data.confirmationUrl || undefined,
          trialDays: data.trialDays !== undefined ? data.trialDays : undefined,
          activatedAt: data.activatedAt || undefined,
          cancelledAt: data.cancelledAt || undefined,
          metadata: data.metadata || undefined,
        },
        create: {
          shopDomain,
          subscriptionId: data.subscriptionId || null,
          planName: data.planName || 'Basic',
          status: data.status || 'PENDING',
          currentPeriodEnd: data.currentPeriodEnd || null,
          test: Boolean(data.test),
          price: data.price || 0.0,
          currency: data.currency || 'USD',
          interval: data.interval || 'EVERY_30_DAYS',
          confirmationUrl: data.confirmationUrl || null,
          trialDays: data.trialDays || 0,
          activatedAt: data.activatedAt || null,
          cancelledAt: data.cancelledAt || null,
          metadata: data.metadata || null,
        },
      });
    } catch (err) {
      logWarn(`⚠️ Prisma Subscription upsert failed: ${err.message}. Using Mongoose fallback.`);
    }
  }

  // 2. Mongoose fallback
  return await Subscription.findOneAndUpdate(
    { shopDomain },
    {
      $set: {
        shopDomain,
        ...(data.subscriptionId && { subscriptionId: data.subscriptionId }),
        ...(data.planName && { planName: data.planName }),
        ...(data.status && { status: data.status }),
        ...(data.currentPeriodEnd && { currentPeriodEnd: data.currentPeriodEnd }),
        ...(data.test !== undefined && { test: data.test }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.currency && { currency: data.currency }),
        ...(data.interval && { interval: data.interval }),
        ...(data.confirmationUrl && { confirmationUrl: data.confirmationUrl }),
        ...(data.trialDays !== undefined && { trialDays: data.trialDays }),
        ...(data.activatedAt && { activatedAt: data.activatedAt }),
        ...(data.cancelledAt && { cancelledAt: data.cancelledAt }),
        ...(data.metadata && { metadata: data.metadata }),
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
};

/**
 * Constructs and executes the `appSubscriptionCreate` mutation.
 * Returns the confirmationUrl for merchant approval.
 */
export const createAppSubscription = async ({
  shopDomain,
  planName = 'Pro',
  price = 29.99,
  interval = 'EVERY_30_DAYS',
  trialDays = 7,
  returnUrl = null,
  test = true,
  accessToken = null,
  host = 'localhost:5000',
  protocol = 'http',
}) => {
  const shop = normalizeShopDomain(shopDomain);
  const isTest = test !== undefined ? Boolean(test) : process.env.NODE_ENV !== 'production';
  const numericPrice = Number(price);

  // Construct return URL for Shopify callback after approval
  const finalReturnUrl =
    returnUrl ||
    `${protocol}://${host}/api/billing/callback?shop=${encodeURIComponent(shop)}`;

  const mutation = `
    mutation AppSubscriptionCreate(
      $name: String!
      $returnUrl: URL!
      $lineItems: [AppSubscriptionLineItemInput!]!
      $test: Boolean
      $trialDays: Int
    ) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: $lineItems
        test: $test
        trialDays: $trialDays
      ) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appSubscription {
          id
          name
          status
          test
          currentPeriodEnd
          trialDays
          createdAt
        }
      }
    }
  `;

  const variables = {
    name: `CustomForge ${planName} Plan`,
    returnUrl: finalReturnUrl,
    test: isTest,
    trialDays: Number(trialDays) || 0,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: {
              amount: numericPrice,
              currencyCode: 'USD',
            },
            interval: interval === 'ANNUAL' ? 'ANNUAL' : 'EVERY_30_DAYS',
          },
        },
      },
    ],
  };

  const responseData = await executeShopifyGraphQL({
    shop,
    accessToken,
    query: mutation,
    variables,
  });

  let confirmationUrl = null;
  let subscriptionId = null;

  const result = responseData.appSubscriptionCreate;
  if (result.userErrors && result.userErrors.length > 0) {
    const errorMsg = result.userErrors.map((u) => `${u.field}: ${u.message}`).join(', ');
    const err = new Error(`Shopify appSubscriptionCreate rejected: ${errorMsg}`);
    err.statusCode = 422;
    err.details = result.userErrors;
    throw err;
  }

  confirmationUrl = result.confirmationUrl;
  subscriptionId = result.appSubscription?.id;

  // Persist local PENDING subscription record
  await upsertSubscriptionRecord({
    shopDomain: shop,
    subscriptionId,
    planName,
    status: 'PENDING',
    test: isTest,
    price: numericPrice,
    currency: 'USD',
    interval,
    confirmationUrl,
    trialDays,
  });

  logSuccess(`💳 [BillingService] Subscription created for ${shop} (Plan: ${planName}, Charge GID: ${subscriptionId})`);

  return {
    shopDomain: shop,
    planName,
    price: numericPrice,
    subscriptionId,
    confirmationUrl,
    status: 'PENDING',
    test: isTest,
    returnUrl: finalReturnUrl,
  };
};

/**
 * Handles billing callback after merchant approves charge in Shopify.
 * Verifies status via GraphQL and activates subscription.
 */
export const verifyAndActivateSubscription = async ({
  shopDomain,
  chargeId,
  accessToken = null,
}) => {
  const shop = normalizeShopDomain(shopDomain);
  const fullSubscriptionId = normalizeSubscriptionId(chargeId);

  const query = `
    query GetSubscriptionStatus($id: ID!) {
      node(id: $id) {
        ... on AppSubscription {
          id
          name
          status
          test
          currentPeriodEnd
          trialDays
          createdAt
        }
      }
      appInstallation {
        activeSubscriptions {
          id
          name
          status
          test
          currentPeriodEnd
        }
      }
    }
  `;

  let shopifyStatus = 'ACTIVE';
  let currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  let isTest = true;
  let planName = 'Pro';

  try {
    const data = await executeShopifyGraphQL({
      shop,
      accessToken,
      query,
      variables: { id: fullSubscriptionId || 'gid://shopify/AppSubscription/0' },
    });

    const nodeSub = data.node;
    const activeSubs = data.appInstallation?.activeSubscriptions || [];

    const matchedSub =
      nodeSub ||
      activeSubs.find((s) => s.id === fullSubscriptionId) ||
      activeSubs[0];

    if (matchedSub) {
      shopifyStatus = matchedSub.status;
      currentPeriodEnd = matchedSub.currentPeriodEnd ? new Date(matchedSub.currentPeriodEnd) : currentPeriodEnd;
      isTest = Boolean(matchedSub.test);
      planName = matchedSub.name?.replace('CustomForge ', '')?.replace(' Plan', '') || planName;
    }
  } catch (err) {
    logWarn(`⚠️ GraphQL subscription verification fallback: ${err.message}`);
  }

  const localStatus = mapShopifyStatus(shopifyStatus);
  const isNowActive = localStatus === 'ACTIVE';

  const updatedRecord = await upsertSubscriptionRecord({
    shopDomain: shop,
    subscriptionId: fullSubscriptionId,
    planName,
    status: localStatus,
    currentPeriodEnd,
    test: isTest,
    activatedAt: isNowActive ? new Date() : undefined,
  });

  if (isNowActive) {
    createNotification({
      shopDomain: shop,
      type: 'BILLING_CHANGE',
      severity: 'SUCCESS',
      title: 'Subscription Activated',
      message: `Your CustomForge ${planName} plan is now active. All features have been unlocked.`,
    }).catch((notifErr) => logWarn(`⚠️ Notification trigger warning: ${notifErr.message}`));
  }

  logSuccess(`✅ [BillingService] Subscription activated for ${shop}: Status = ${localStatus}`);

  return {
    shopDomain: shop,
    subscriptionId: fullSubscriptionId,
    status: localStatus,
    isActive: isNowActive,
    currentPeriodEnd,
    test: isTest,
    planName,
    subscription: updatedRecord,
  };
};

/**
 * Executes the `appSubscriptionCancel` mutation and updates status to CANCELLED.
 */
export const cancelAppSubscription = async ({
  shopDomain,
  subscriptionId = null,
  prorate = true,
  accessToken = null,
}) => {
  const shop = normalizeShopDomain(shopDomain);

  // Look up existing subscription if subscriptionId is not supplied
  let targetId = subscriptionId ? normalizeSubscriptionId(subscriptionId) : null;
  if (!targetId) {
    const existing = await getSubscriptionForShop(shop);
    targetId = existing?.subscriptionId;
  }

  if (!targetId) {
    const err = new Error(`No active subscription ID found for store "${shop}".`);
    err.statusCode = 404;
    throw err;
  }

  const mutation = `
    mutation AppSubscriptionCancel($id: ID!, $prorate: Boolean) {
      appSubscriptionCancel(id: $id, prorate: $prorate) {
        userErrors {
          field
          message
        }
        appSubscription {
          id
          status
        }
      }
    }
  `;

  try {
    const data = await executeShopifyGraphQL({
      shop,
      accessToken,
      query: mutation,
      variables: { id: targetId, prorate: Boolean(prorate) },
    });

    const result = data.appSubscriptionCancel;
    if (result.userErrors && result.userErrors.length > 0) {
      const errorMsg = result.userErrors.map((u) => `${u.field}: ${u.message}`).join(', ');
      logWarn(`⚠️ Shopify cancel userErrors: ${errorMsg}`);
    }
  } catch (err) {
    logWarn(`⚠️ GraphQL cancellation warning: ${err.message}. Marking local DB record as CANCELLED.`);
  }

  // Update local DB status to CANCELLED
  const updatedRecord = await upsertSubscriptionRecord({
    shopDomain: shop,
    subscriptionId: targetId,
    status: 'CANCELLED',
    cancelledAt: new Date(),
  });

  // Trigger notification for subscription cancellation
  createNotification({
    shopDomain: shop,
    type: 'SUBSCRIPTION_CANCELLED',
    severity: 'WARNING',
    title: 'Subscription Cancelled',
    message: `Your CustomForge subscription has been cancelled. Premium access remains until the end of your billing period.`,
  }).catch((notifErr) => logWarn(`⚠️ Notification trigger warning: ${notifErr.message}`));

  logSuccess(`🛑 [BillingService] Subscription cancelled for ${shop}`);

  return {
    success: true,
    shopDomain: shop,
    subscriptionId: targetId,
    status: 'CANCELLED',
    cancelledAt: new Date(),
    subscription: updatedRecord,
  };
};

/**
 * Syncs incoming Shopify `app/subscriptions/update` webhook payload with local database.
 */
export const syncSubscriptionFromWebhook = async (payload, shopDomain) => {
  const subData = payload?.app_subscription || payload;
  if (!subData) return null;

  const rawId = subData.admin_graphql_api_id || subData.id;
  const subscriptionId = normalizeSubscriptionId(rawId);
  const rawStatus = subData.status;
  const normalizedStatus = mapShopifyStatus(rawStatus);

  const planName = subData.name
    ? String(subData.name).replace('CustomForge ', '').replace(' Plan', '').trim()
    : 'Pro';

  const currentPeriodEnd = subData.current_period_end
    ? new Date(subData.current_period_end)
    : null;

  const test = Boolean(subData.test);
  const shop = normalizeShopDomain(shopDomain || subData.shop_domain || subData.shop);

  const updated = await upsertSubscriptionRecord({
    shopDomain: shop,
    subscriptionId,
    planName,
    status: normalizedStatus,
    currentPeriodEnd,
    test,
    ...(normalizedStatus === 'ACTIVE' && { activatedAt: new Date() }),
    ...(normalizedStatus === 'CANCELLED' && { cancelledAt: new Date() }),
    metadata: subData,
  });

  // Trigger centralized application notifications based on incoming Shopify webhook status
  if (normalizedStatus === 'CANCELLED') {
    createNotification({
      shopDomain: shop,
      type: 'SUBSCRIPTION_CANCELLED',
      severity: 'WARNING',
      title: 'Subscription Cancelled',
      message: `Your CustomForge ${planName} subscription was cancelled. Your features remain active until ${currentPeriodEnd ? currentPeriodEnd.toLocaleDateString() : 'the end of your current cycle'}.`,
    }).catch((notifErr) => logWarn(`⚠️ Webhook notification warning: ${notifErr.message}`));
  } else if (normalizedStatus === 'ACTIVE') {
    createNotification({
      shopDomain: shop,
      type: 'BILLING_CHANGE',
      severity: 'SUCCESS',
      title: 'Subscription Active',
      message: `Your CustomForge ${planName} subscription is active and synced with Shopify.`,
    }).catch((notifErr) => logWarn(`⚠️ Webhook notification warning: ${notifErr.message}`));
  } else if (normalizedStatus === 'EXPIRED') {
    createNotification({
      shopDomain: shop,
      type: 'BILLING_CHANGE',
      severity: 'ERROR',
      title: 'Subscription Expired',
      message: `Your CustomForge ${planName} subscription expired or charge declined. Please update your billing details in Shopify admin.`,
    }).catch((notifErr) => logWarn(`⚠️ Webhook notification warning: ${notifErr.message}`));
  }

  logSuccess(`🔔 [BillingService Webhook] Synced ${shop}: status=${normalizedStatus} (Shopify raw: ${rawStatus})`);

  return updated;
};

/**
 * Fetch subscription record for a shop from Prisma with Mongoose fallback.
 */
export const getSubscriptionForShop = async (shopDomain) => {
  const shop = normalizeShopDomain(shopDomain);

  if (prisma?.subscription) {
    try {
      const sub = await prisma.subscription.findUnique({
        where: { shopDomain: shop },
      });
      if (sub) return sub;
    } catch (err) {
      logWarn(`⚠️ Prisma getSubscriptionForShop error: ${err.message}`);
    }
  }

  return await Subscription.findOne({ shopDomain: shop }).lean();
};

export default {
  createAppSubscription,
  verifyAndActivateSubscription,
  cancelAppSubscription,
  syncSubscriptionFromWebhook,
  getSubscriptionForShop,
  executeShopifyGraphQL,
  normalizeShopDomain,
  normalizeSubscriptionId,
  mapShopifyStatus,
  DEFAULT_PLANS,
};
