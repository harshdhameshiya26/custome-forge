/* eslint-env node */

import prisma from '../config/prisma.js';
import CustomOrderTimeline, { ORDER_TIMELINE_STAGES } from '../models/custom-order-timeline.model.js';
import CustomOrder from '../models/custom-order.model.js';
import { logError, logSuccess, logWarn } from '../utils/logger.js';

/**
 * Standard customer-friendly default messages for each production stage.
 */
const DEFAULT_STAGE_MESSAGES = Object.freeze({
  DESIGN_RECEIVED: 'Your design has been received and queued for prepress inspection.',
  PROOF_READY: 'Your digital proof is ready for review. Please inspect and approve your customization.',
  APPROVED: 'Digital proof approved! Your order has been scheduled for manufacturing.',
  IN_PRODUCTION: 'Your custom product is currently in active production on our printing floor.',
  SHIPPED: 'Manufacturing complete! Your custom order has shipped and is on its way.',
});

/**
 * Stage progress weights to inform customers of completion percentage.
 */
const STAGE_PROGRESS_PERCENT = Object.freeze({
  DESIGN_RECEIVED: 20,
  PROOF_READY: 40,
  APPROVED: 60,
  IN_PRODUCTION: 80,
  SHIPPED: 100,
});

/**
 * Helper to clean and normalize a Shopify Order ID (strips GID prefix if present).
 * e.g. "gid://shopify/Order/8209829119461" -> "8209829119461"
 */
const normalizeOrderId = (rawId) => {
  if (!rawId) return '';
  const str = String(rawId).trim();
  const match = str.match(/Order\/(\d+)/);
  return match ? match[1] : str;
};

/**
 * Find an order timeline by either Shopify Order ID or MongoDB _id using Prisma or Mongoose.
 */
const findTimelineByIdentifier = async (orderId) => {
  const normalizedId = normalizeOrderId(orderId);

  // 1. Try Prisma first
  if (prisma?.customOrderTimeline) {
    try {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(orderId);
      const timeline = await prisma.customOrderTimeline.findFirst({
        where: {
          OR: [
            { shopifyOrderId: normalizedId },
            ...(isObjectId ? [{ id: orderId }] : []),
          ],
        },
      });
      if (timeline) return { timeline, source: 'PRISMA' };
    } catch (err) {
      logError(`⚠️ Prisma findTimeline query error: ${err.message}`);
    }
  }

  // 2. Fallback to Mongoose
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(orderId);
    const query = isObjectId
      ? { $or: [{ shopifyOrderId: normalizedId }, { _id: orderId }] }
      : { shopifyOrderId: normalizedId };

    const mgTimeline = await CustomOrderTimeline.findOne(query);
    if (mgTimeline) return { timeline: mgTimeline, source: 'MONGOOSE' };
  } catch (err) {
    logError(`⚠️ Mongoose findTimeline query error: ${err.message}`);
  }

  return { timeline: null, source: null };
};

/**
 * @desc    Shopify Webhook Handler: orders/create
 *          Initializes order timeline to "DESIGN_RECEIVED" when a new order is placed.
 * @route   POST /api/webhooks/orders/create
 * @access  Public (HMAC Verified)
 */
export const handleOrderCreatedWebhook = async (req, res) => {
  try {
    const payload = req.body || {};

    const rawOrderId = payload.id || payload.order_id || payload.shopifyOrderId;
    const customerEmail =
      payload.email ||
      payload.contact_email ||
      payload.customer?.email ||
      payload.customerEmail;
    const shop =
      req.get('X-Shopify-Shop-Domain') ||
      payload.shop ||
      payload.domain ||
      process.env.SHOPIFY_SHOP ||
      '';

    if (!rawOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing order ID in webhook payload.',
      });
    }

    const shopifyOrderId = normalizeOrderId(rawOrderId);

    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Missing customer email in webhook payload. customerEmail is required.',
      });
    }

    // Extract customization metadata from line items if present
    const customLineItems = (payload.line_items || []).map((item) => ({
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      properties: item.properties || [],
      customAttributes: (item.properties || []).reduce((acc, curr) => {
        if (curr.name && curr.value) acc[curr.name] = curr.value;
        return acc;
      }, {}),
    }));

    const orderMetadata = {
      orderNumber: payload.order_number || payload.name,
      totalPrice: payload.total_price,
      currency: payload.currency,
      financialStatus: payload.financial_status,
      customLineItems,
      customerNotes: payload.note,
      shippingAddress: payload.shipping_address
        ? {
            city: payload.shipping_address.city,
            country: payload.shipping_address.country,
            zip: payload.shipping_address.zip,
          }
        : null,
    };

    const initialHistoryEntry = {
      stage: 'DESIGN_RECEIVED',
      message: DEFAULT_STAGE_MESSAGES.DESIGN_RECEIVED,
      timestamp: new Date(),
      metadata: {
        orderNumber: payload.order_number || payload.name,
        lineItemsCount: customLineItems.length,
      },
    };

    // -------------------------------------------------------------------------
    // Idempotency: Return existing record if webhook is retried by Shopify
    // -------------------------------------------------------------------------
    const existing = await findTimelineByIdentifier(shopifyOrderId);
    if (existing.timeline) {
      return res.status(200).json({
        success: true,
        message: 'Order timeline already exists for this order ID (idempotent response).',
        timeline: existing.timeline,
      });
    }

    // -------------------------------------------------------------------------
    // Create new Timeline with Prisma (or Mongoose fallback)
    // -------------------------------------------------------------------------
    let createdTimeline = null;

    if (prisma?.customOrderTimeline) {
      try {
        createdTimeline = await prisma.customOrderTimeline.create({
          data: {
            shopifyOrderId,
            customerEmail: customerEmail.toLowerCase().trim(),
            currentStage: 'DESIGN_RECEIVED',
            history: [initialHistoryEntry],
            metadata: orderMetadata,
            shop,
          },
        });
      } catch (prismaError) {
        logError(`⚠️ Prisma customOrderTimeline creation failed: ${prismaError.message}`);
      }
    }

    if (!createdTimeline) {
      createdTimeline = await CustomOrderTimeline.create({
        shopifyOrderId,
        customerEmail: customerEmail.toLowerCase().trim(),
        currentStage: 'DESIGN_RECEIVED',
        history: [initialHistoryEntry],
        metadata: orderMetadata,
        shop,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Custom order timeline initialized to DESIGN_RECEIVED.',
      timeline: createdTimeline,
    });
  } catch (error) {
    logError(`❌ orders/create webhook error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal error processing order created webhook.',
      error: error.message,
    });
  }
};

/**
 * @desc    Fetch complete stage history and current status for a specific order.
 * @route   GET /api/orders/timeline/:orderId
 * @access  Public / Storefront / Customer
 */
export const getOrderTimeline = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId || !orderId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required in URL parameter.',
      });
    }

    const { timeline } = await findTimelineByIdentifier(orderId);

    if (!timeline) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_TIMELINE_NOT_FOUND',
          message: `No timeline found for order ID "${orderId}".`,
          suggestion: 'Ensure the order was placed with a custom product and that the webhook has been processed.',
        },
      });
    }

    const currentStage = timeline.currentStage;
    const progressPercent = STAGE_PROGRESS_PERCENT[currentStage] || 0;
    const isCompleted = currentStage === 'SHIPPED';

    return res.status(200).json({
      success: true,
      timeline: {
        id: timeline.id || timeline._id,
        shopifyOrderId: timeline.shopifyOrderId,
        customerEmail: timeline.customerEmail,
        currentStage: timeline.currentStage,
        progressPercent,
        isCompleted,
        currentStageMessage:
          DEFAULT_STAGE_MESSAGES[currentStage] || 'Custom order is being processed.',
        history: timeline.history || [],
        metadata: timeline.metadata || null,
        shop: timeline.shop || null,
        createdAt: timeline.createdAt,
        updatedAt: timeline.updatedAt,
      },
    });
  } catch (error) {
    logError(`❌ getOrderTimeline error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order timeline.',
      error: error.message,
    });
  }
};

/**
 * @desc    Update and advance an order's status stage, recording a new entry into history.
 * @route   PATCH /api/orders/timeline/:orderId/stage
 * @access  Merchant / Production Automation
 */
export const updateOrderTimelineStage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { stage, message, metadata: eventMetadata } = req.body;

    if (!stage) {
      return res.status(400).json({
        success: false,
        message: 'stage is required in request body.',
        allowedStages: ORDER_TIMELINE_STAGES,
      });
    }

    const normalizedStage = String(stage).trim().toUpperCase();

    if (!ORDER_TIMELINE_STAGES.includes(normalizedStage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage "${stage}". Must be one of: ${ORDER_TIMELINE_STAGES.join(', ')}.`,
        allowedStages: ORDER_TIMELINE_STAGES,
      });
    }

    const { timeline, source } = await findTimelineByIdentifier(orderId);

    if (!timeline) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_TIMELINE_NOT_FOUND',
          message: `Cannot update stage: Order timeline not found for ID "${orderId}".`,
        },
      });
    }

    // Build the new timeline history entry
    const newHistoryEntry = {
      stage: normalizedStage,
      message:
        message && String(message).trim()
          ? String(message).trim()
          : DEFAULT_STAGE_MESSAGES[normalizedStage],
      timestamp: new Date(),
      metadata: eventMetadata || null,
    };

    let updatedTimeline = null;

    if (source === 'PRISMA' && prisma?.customOrderTimeline) {
      try {
        const existingHistory = Array.isArray(timeline.history) ? timeline.history : [];
        const mergedMetadata = eventMetadata
          ? { ...(timeline.metadata || {}), ...eventMetadata }
          : timeline.metadata;

        updatedTimeline = await prisma.customOrderTimeline.update({
          where: { id: timeline.id },
          data: {
            currentStage: normalizedStage,
            history: {
              set: [...existingHistory, newHistoryEntry],
            },
            metadata: mergedMetadata,
          },
        });
      } catch (prismaError) {
        logError(`⚠️ Prisma updateOrderTimelineStage error: ${prismaError.message}`);
      }
    }

    if (!updatedTimeline) {
      // Mongoose update
      const existingHistory = Array.isArray(timeline.history) ? timeline.history : [];
      timeline.currentStage = normalizedStage;
      timeline.history.push(newHistoryEntry);
      if (eventMetadata) {
        timeline.metadata = { ...(timeline.metadata || {}), ...eventMetadata };
      }
      updatedTimeline = await timeline.save();
    }

    const progressPercent = STAGE_PROGRESS_PERCENT[normalizedStage] || 0;

    return res.status(200).json({
      success: true,
      message: `Order timeline advanced to "${normalizedStage}".`,
      progressPercent,
      isCompleted: normalizedStage === 'SHIPPED',
      timeline: updatedTimeline,
    });
  } catch (error) {
    logError(`❌ updateOrderTimelineStage error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order timeline stage.',
      error: error.message,
    });
  }
};

/**
 * @desc    Shopify Webhook Handler: orders/fulfilled
 *          Advances order timeline to "SHIPPED" (100% complete) and attaches fulfillment tracking info.
 * @route   POST /api/webhooks/orders/fulfilled
 * @access  Public (HMAC Verified)
 */
export const handleOrderFulfilledWebhook = async (req, res) => {
  try {
    const payload = req.body || {};
    const rawOrderId = payload.id || payload.order_id || payload.shopifyOrderId;

    if (!rawOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing order ID in fulfillment webhook payload.',
      });
    }

    const shopifyOrderId = normalizeOrderId(rawOrderId);
    const { timeline, source } = await findTimelineByIdentifier(shopifyOrderId);

    if (!timeline) {
      logWarn(`⚠️ [orders/fulfilled] No timeline found for order ID "${shopifyOrderId}". Skipping.`);
      return res.status(200).json({
        success: true,
        message: `No custom timeline found for order "${shopifyOrderId}". Ignored.`,
      });
    }

    // Extract fulfillment & shipment tracking details
    const fulfillments = payload.fulfillments || [];
    const firstFulfillment = fulfillments[0] || {};
    const trackingNumber =
      firstFulfillment.tracking_number ||
      (firstFulfillment.tracking_numbers && firstFulfillment.tracking_numbers[0]) ||
      payload.tracking_number ||
      null;
    const trackingUrl =
      firstFulfillment.tracking_url ||
      (firstFulfillment.tracking_urls && firstFulfillment.tracking_urls[0]) ||
      payload.tracking_url ||
      null;
    const trackingCompany =
      firstFulfillment.tracking_company ||
      payload.tracking_company ||
      null;

    const fulfillmentMeta = {
      trackingNumber,
      trackingUrl,
      trackingCompany,
      fulfilledAt: firstFulfillment.created_at || new Date().toISOString(),
      fulfillmentId: firstFulfillment.id || null,
      status: firstFulfillment.shipment_status || 'fulfilled',
    };

    const newHistoryEntry = {
      stage: 'SHIPPED',
      message: trackingNumber
        ? `Manufacturing complete and shipped via ${trackingCompany || 'carrier'}! Tracking: ${trackingNumber}`
        : DEFAULT_STAGE_MESSAGES.SHIPPED,
      timestamp: new Date(),
      metadata: fulfillmentMeta,
    };

    let updatedTimeline = null;

    if (source === 'PRISMA' && prisma?.customOrderTimeline) {
      try {
        const existingHistory = Array.isArray(timeline.history) ? timeline.history : [];
        const mergedMetadata = { ...(timeline.metadata || {}), fulfillment: fulfillmentMeta };

        updatedTimeline = await prisma.customOrderTimeline.update({
          where: { id: timeline.id },
          data: {
            currentStage: 'SHIPPED',
            history: { set: [...existingHistory, newHistoryEntry] },
            metadata: mergedMetadata,
          },
        });
      } catch (err) {
        logError(`⚠️ Prisma handleOrderFulfilledWebhook error: ${err.message}`);
      }
    }

    if (!updatedTimeline) {
      timeline.currentStage = 'SHIPPED';
      timeline.history.push(newHistoryEntry);
      timeline.metadata = { ...(timeline.metadata || {}), fulfillment: fulfillmentMeta };
      updatedTimeline = await timeline.save();
    }

    // Also update CustomOrder status if exists
    try {
      if (prisma?.customOrder) {
        await prisma.customOrder.updateMany({
          where: { OR: [{ orderId: shopifyOrderId }, { shopifyOrderId }] },
          data: { status: 'COMPLETED' },
        });
      }
      await CustomOrder.updateMany(
        { $or: [{ orderId: shopifyOrderId }, { shopifyOrderId }] },
        { $set: { status: 'COMPLETED' } },
      );
    } catch (orderErr) {
      logWarn(`⚠️ CustomOrder status update error on fulfillment: ${orderErr.message}`);
    }

    logSuccess(`🚚 [orders/fulfilled] Order "${shopifyOrderId}" timeline marked as SHIPPED.`);

    return res.status(200).json({
      success: true,
      message: 'Order timeline advanced to SHIPPED upon Shopify fulfillment.',
      timeline: updatedTimeline,
    });
  } catch (error) {
    logError(`❌ orders/fulfilled webhook error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal error processing order fulfilled webhook.',
      error: error.message,
    });
  }
};

/**
 * @desc    Shopify Webhook Handler: orders/cancelled
 *          Updates custom order timeline when an order is cancelled in Shopify.
 * @route   POST /api/webhooks/orders/cancelled
 * @access  Public (HMAC Verified)
 */
export const handleOrderCancelledWebhook = async (req, res) => {
  try {
    const payload = req.body || {};
    const rawOrderId = payload.id || payload.order_id || payload.shopifyOrderId;

    if (!rawOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing order ID in cancellation webhook payload.',
      });
    }

    const shopifyOrderId = normalizeOrderId(rawOrderId);
    const { timeline, source } = await findTimelineByIdentifier(shopifyOrderId);

    if (!timeline) {
      return res.status(200).json({
        success: true,
        message: `No custom timeline found for order "${shopifyOrderId}". Ignored.`,
      });
    }

    const cancelReason = payload.cancel_reason || 'Merchant or Customer Cancelled';
    const cancelledAt = payload.cancelled_at || new Date().toISOString();

    const cancellationMeta = {
      cancelReason,
      cancelledAt,
    };

    const newHistoryEntry = {
      stage: timeline.currentStage || 'DESIGN_RECEIVED',
      message: `Order was cancelled in Shopify (Reason: ${cancelReason}). Production stopped.`,
      timestamp: new Date(),
      metadata: cancellationMeta,
    };

    let updatedTimeline = null;

    if (source === 'PRISMA' && prisma?.customOrderTimeline) {
      try {
        const existingHistory = Array.isArray(timeline.history) ? timeline.history : [];
        const mergedMetadata = { ...(timeline.metadata || {}), cancellation: cancellationMeta };

        updatedTimeline = await prisma.customOrderTimeline.update({
          where: { id: timeline.id },
          data: {
            history: { set: [...existingHistory, newHistoryEntry] },
            metadata: mergedMetadata,
          },
        });
      } catch (err) {
        logError(`⚠️ Prisma handleOrderCancelledWebhook error: ${err.message}`);
      }
    }

    if (!updatedTimeline) {
      timeline.history.push(newHistoryEntry);
      timeline.metadata = { ...(timeline.metadata || {}), cancellation: cancellationMeta };
      updatedTimeline = await timeline.save();
    }

    // Also update CustomOrder status if exists
    try {
      if (prisma?.customOrder) {
        await prisma.customOrder.updateMany({
          where: { OR: [{ orderId: shopifyOrderId }, { shopifyOrderId }] },
          data: { status: 'CANCELLED' },
        });
      }
      await CustomOrder.updateMany(
        { $or: [{ orderId: shopifyOrderId }, { shopifyOrderId }] },
        { $set: { status: 'CANCELLED' } },
      );
    } catch (orderErr) {
      logWarn(`⚠️ CustomOrder status update error on cancellation: ${orderErr.message}`);
    }

    logWarn(`🛑 [orders/cancelled] Order "${shopifyOrderId}" recorded as CANCELLED.`);

    return res.status(200).json({
      success: true,
      message: 'Order cancellation recorded in timeline.',
      timeline: updatedTimeline,
    });
  } catch (error) {
    logError(`❌ orders/cancelled webhook error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal error processing order cancelled webhook.',
      error: error.message,
    });
  }
};

/**
 * @desc    Shopify Webhook Handler: orders/updated
 *          Updates custom order metadata when order changes in Shopify.
 * @route   POST /api/webhooks/orders/updated
 * @access  Public (HMAC Verified)
 */
export const handleOrderUpdatedWebhook = async (req, res) => {
  try {
    const payload = req.body || {};
    const rawOrderId = payload.id || payload.order_id || payload.shopifyOrderId;

    if (!rawOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing order ID in order updated webhook payload.',
      });
    }

    const shopifyOrderId = normalizeOrderId(rawOrderId);
    const { timeline, source } = await findTimelineByIdentifier(shopifyOrderId);

    if (!timeline) {
      return res.status(200).json({
        success: true,
        message: `No custom timeline found for order "${shopifyOrderId}". Ignored.`,
      });
    }

    const updatedMeta = {
      ...(timeline.metadata || {}),
      financialStatus: payload.financial_status || timeline.metadata?.financialStatus,
      fulfillmentStatus: payload.fulfillment_status || timeline.metadata?.fulfillmentStatus,
      customerNotes: payload.note !== undefined ? payload.note : timeline.metadata?.customerNotes,
      updatedAt: new Date().toISOString(),
    };

    let updatedTimeline = null;
    if (source === 'PRISMA' && prisma?.customOrderTimeline) {
      try {
        updatedTimeline = await prisma.customOrderTimeline.update({
          where: { id: timeline.id },
          data: { metadata: updatedMeta },
        });
      } catch (err) {
        logError(`⚠️ Prisma handleOrderUpdatedWebhook error: ${err.message}`);
      }
    }

    if (!updatedTimeline) {
      timeline.metadata = updatedMeta;
      updatedTimeline = await timeline.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Order timeline metadata synced from Shopify update.',
      timeline: updatedTimeline,
    });
  } catch (error) {
    logError(`❌ orders/updated webhook error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Internal error processing order updated webhook.',
      error: error.message,
    });
  }
};

/**
 * @desc    Shopify Webhook Multiplexer: /api/webhooks/orders
 *          Dispatches to create, fulfilled, cancelled, or updated handlers based on X-Shopify-Topic header.
 * @route   POST /api/webhooks/orders
 * @access  Public (HMAC Verified)
 */
export const handleOrdersMultiplexer = async (req, res, next) => {
  const topic = (
    req.get('X-Shopify-Topic') ||
    req.get('x-shopify-topic') ||
    ''
  ).toLowerCase();

  if (topic.includes('create')) {
    return handleOrderCreatedWebhook(req, res, next);
  }
  if (topic.includes('fulfill')) {
    return handleOrderFulfilledWebhook(req, res, next);
  }
  if (topic.includes('cancel')) {
    return handleOrderCancelledWebhook(req, res, next);
  }
  return handleOrderUpdatedWebhook(req, res, next);
};

/**
 * @desc    List custom orders for merchant dashboard & tracking
 * @route   GET /api/orders
 */
export const listOrders = async (req, res, next) => {
  try {
    const shop =
      req.query.shop ||
      req.get('x-shop-domain') ||
      req.get('x-shopify-shop-domain') ||
      process.env.SHOPIFY_SHOP ||
      null;

    let orders = [];
    try {
      orders = await prisma.customOrder.findMany({
        where: shop ? { shop } : {},
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    } catch {
      orders = await CustomOrder.find(shop ? { shop } : {}).sort({ createdAt: -1 }).limit(100).lean();
    }

    const data = (orders || []).map((o) => ({
      id: o.shopifyOrderId ? `#${o.shopifyOrderId}` : `#${o.orderId}`,
      rawId: o.orderId,
      shopifyOrderId: o.shopifyOrderId,
      date: o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent',
      customer: o.customerEmail || 'Anonymous Customer',
      product: o.productType || 'Custom Product',
      technique: o.customizationType || 'Direct-to-Garment',
      dpi: '300 DPI',
      status: o.status || 'Pending',
      supplier: o.assignedQueue || o.supplierId || 'Auto Assigned',
      tags: o.tags || [],
    }));

    return res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    logError(`[listOrders] ${error.message}`);
    return next(error);
  }
};

export default {
  handleOrderCreatedWebhook,
  handleOrderFulfilledWebhook,
  handleOrderCancelledWebhook,
  handleOrderUpdatedWebhook,
  handleOrdersMultiplexer,
  getOrderTimeline,
  updateOrderTimelineStage,
  listOrders,
};

