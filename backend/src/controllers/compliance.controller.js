/* eslint-env node */

import prisma from '../config/prisma.js';
import Design from '../models/design.model.js';
import DesignLibraryItem from '../models/design-library-item.model.js';
import GuestSession from '../models/guest-session.model.js';
import CustomOrderTimeline from '../models/custom-order-timeline.model.js';
import Subscription from '../models/subscription.model.js';
import MerchantSettings from '../models/merchant-settings.model.js';
import { logSuccess, logWarn, logError } from '../utils/logger.js';

/**
 * @desc    Shopify Mandatory Compliance Webhook: customers/data_request
 *          Triggered when a customer requests a copy of their personal data from Shopify.
 * @route   POST /api/webhooks/compliance/customers_data_request
 * @access  Shopify Webhook Service (HMAC Verified)
 */
export const handleCustomersDataRequest = async (req, res) => {
  try {
    const payload = req.body || {};
    const shopDomain =
      req.get('X-Shopify-Shop-Domain') ||
      req.get('x-shopify-shop-domain') ||
      payload.shop_domain ||
      '';
    const customer = payload.customer || {};
    const customerId = customer.id ? String(customer.id) : null;
    const customerEmail = customer.email ? customer.email.toLowerCase().trim() : null;

    logSuccess(
      `📋 [Compliance] Received customers/data_request for shop "${shopDomain}", customerId="${customerId}", email="${customerEmail}"`,
    );

    // Collect stored data references for reporting/audit
    const customerDesigns = customerId
      ? await Design.find({ shopifyCustomerId: customerId }).select('_id title status createdAt').lean()
      : [];

    const libraryItems = customerId
      ? await DesignLibraryItem.find({ customerId }).select('_id title tags createdAt').lean()
      : [];

    return res.status(200).json({
      success: true,
      message: 'Customer data request received and processed.',
      data: {
        shopDomain,
        customerId,
        customerEmail,
        recordsFound: {
          designsCount: customerDesigns.length,
          libraryItemsCount: libraryItems.length,
        },
      },
    });
  } catch (error) {
    logError(`❌ [Compliance] Error in customers/data_request: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to process customers/data_request webhook.',
      error: error.message,
    });
  }
};

/**
 * @desc    Shopify Mandatory Compliance Webhook: customers/redact
 *          Triggered when a customer requests deletion of their personal data.
 * @route   POST /api/webhooks/compliance/customers_redact
 * @access  Shopify Webhook Service (HMAC Verified)
 */
export const handleCustomersRedact = async (req, res) => {
  try {
    const payload = req.body || {};
    const shopDomain =
      req.get('X-Shopify-Shop-Domain') ||
      req.get('x-shopify-shop-domain') ||
      payload.shop_domain ||
      '';
    const customer = payload.customer || {};
    const customerId = customer.id ? String(customer.id) : null;
    const customerEmail = customer.email ? customer.email.toLowerCase().trim() : null;

    logSuccess(
      `🗑️ [Compliance] Received customers/redact for shop "${shopDomain}", customerId="${customerId}", email="${customerEmail}"`,
    );

    if (customerId) {
      // 1. Redact/Anonymize designs
      await Design.updateMany(
        { shopifyCustomerId: customerId },
        {
          $set: {
            shopifyCustomerId: `redacted_${Date.now()}`,
            title: 'Redacted Design',
            isLibraryItem: false,
          },
        },
      );

      // 2. Remove customer library items
      await DesignLibraryItem.deleteMany({ customerId });

      // 3. Clear guest claimed sessions
      await GuestSession.deleteMany({ customerId });
    }

    if (customerEmail) {
      // 4. Anonymize customer email in order timelines
      await CustomOrderTimeline.updateMany(
        { customerEmail },
        { $set: { customerEmail: `redacted_${Date.now()}@anonymized.customforge` } },
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Customer personal data successfully redacted and anonymized.',
    });
  } catch (error) {
    logError(`❌ [Compliance] Error in customers/redact: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to process customers/redact webhook.',
      error: error.message,
    });
  }
};

/**
 * @desc    Shopify Mandatory Compliance Webhook: shop/redact
 *          Triggered 48 hours after a merchant uninstalls the app to delete all shop records.
 * @route   POST /api/webhooks/compliance/shop_redact
 * @access  Shopify Webhook Service (HMAC Verified)
 */
export const handleShopRedact = async (req, res) => {
  try {
    const payload = req.body || {};
    const shopDomain =
      req.get('X-Shopify-Shop-Domain') ||
      req.get('x-shopify-shop-domain') ||
      payload.shop_domain ||
      payload.myshopify_domain ||
      '';

    logWarn(`🧹 [Compliance] Received shop/redact for store "${shopDomain}". Purging store data.`);

    if (shopDomain) {
      const normalized = shopDomain.toLowerCase().trim();

      // Clean up subscriptions
      await Subscription.deleteMany({
        shopDomain: { $regex: new RegExp(`^${normalized}$`, 'i') },
      });

      // Clean up merchant settings
      await MerchantSettings.deleteMany({
        shopDomain: { $regex: new RegExp(`^${normalized}$`, 'i') },
      });

      // Clean up Prisma sessions if present
      if (prisma?.tbl_Session) {
        try {
          await prisma.tbl_Session.deleteMany({
            where: { shop: { equals: normalized, mode: 'insensitive' } },
          });
        } catch (sessionErr) {
          logWarn(`⚠️ [Compliance] Prisma session deletion notice: ${sessionErr.message}`);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Shop data for "${shopDomain}" successfully purged.`,
    });
  } catch (error) {
    logError(`❌ [Compliance] Error in shop/redact: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to process shop/redact webhook.',
      error: error.message,
    });
  }
};

/**
 * @desc    Shopify Compliance Webhook Multiplexer: /api/webhooks/compliance
 *          Dispatches to customers/data_request, customers/redact, or shop/redact based on X-Shopify-Topic header.
 * @route   POST /api/webhooks/compliance
 * @access  Shopify Webhook Service (HMAC Verified)
 */
export const handleComplianceMultiplexer = async (req, res, next) => {
  const topic = (
    req.get('X-Shopify-Topic') ||
    req.get('x-shopify-topic') ||
    ''
  ).toLowerCase();

  if (topic.includes('data_request')) {
    return handleCustomersDataRequest(req, res, next);
  }
  if (topic.includes('customers') && topic.includes('redact')) {
    return handleCustomersRedact(req, res, next);
  }
  if (topic.includes('shop') && topic.includes('redact')) {
    return handleShopRedact(req, res, next);
  }

  return res.status(200).json({
    success: true,
    message: `Compliance topic "${topic}" acknowledged.`,
  });
};

export default {
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact,
  handleComplianceMultiplexer,
};
